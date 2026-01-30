import { Hono } from "hono"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js"
import { StravaClient } from "./api.js"
import { registerTools } from "./tools.js"

// Types for Cloudflare Workers environment
interface Env {
	STRAVA_CLIENT_ID: string
	STRAVA_CLIENT_SECRET: string
	OAUTH_STATE_SECRET: string
}

const app = new Hono<{ Bindings: Env }>()

// Strava OAuth URLs
const STRAVA_AUTHORIZE_URL = "https://www.strava.com/oauth/authorize"
const STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token"

// Scopes we request from Strava
const STRAVA_SCOPES = [
	"read",
	"read_all",
	"profile:read_all",
	"activity:read",
	"activity:read_all",
	"activity:write",
].join(",")

// Helper to encode state (includes redirect_uri for after OAuth completes)
async function encodeState(data: object, secret: string): Promise<string> {
	const encoder = new TextEncoder()
	const dataStr = JSON.stringify(data)

	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"]
	)

	const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(dataStr))
	const sigBase64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
	const dataBase64 = btoa(dataStr)

	return `${dataBase64}.${sigBase64}`
}

// Helper to decode and verify state
async function decodeState(state: string, secret: string): Promise<object | null> {
	try {
		const [dataBase64, sigBase64] = state.split(".")
		if (!dataBase64 || !sigBase64) return null

		const encoder = new TextEncoder()
		const dataStr = atob(dataBase64)

		const key = await crypto.subtle.importKey(
			"raw",
			encoder.encode(secret),
			{ name: "HMAC", hash: "SHA-256" },
			false,
			["verify"]
		)

		const signature = Uint8Array.from(atob(sigBase64), c => c.charCodeAt(0))
		const valid = await crypto.subtle.verify("HMAC", key, signature, encoder.encode(dataStr))

		if (!valid) return null
		return JSON.parse(dataStr)
	} catch {
		return null
	}
}

// Health check
app.get("/", c => c.text("Strava MCP server"))

// ========== OAuth 2.0 Metadata Endpoints (RFC 9728 & RFC 8414) ==========

// Protected Resource Metadata - tells clients where to authenticate
app.get("/.well-known/oauth-protected-resource", c => {
	const host = c.req.header("host") || "localhost"
	const protocol = host.includes("localhost") ? "http" : "https"
	const baseUrl = `${protocol}://${host}`

	return c.json({
		resource: `${baseUrl}/mcp`,
		authorization_servers: [baseUrl],
		scopes_supported: STRAVA_SCOPES.split(","),
	})
})

// Also support the /mcp path variant
app.get("/.well-known/oauth-protected-resource/mcp", c => {
	const host = c.req.header("host") || "localhost"
	const protocol = host.includes("localhost") ? "http" : "https"
	const baseUrl = `${protocol}://${host}`

	return c.json({
		resource: `${baseUrl}/mcp`,
		authorization_servers: [baseUrl],
		scopes_supported: STRAVA_SCOPES.split(","),
	})
})

// Authorization Server Metadata - describes OAuth endpoints
app.get("/.well-known/oauth-authorization-server", c => {
	const host = c.req.header("host") || "localhost"
	const protocol = host.includes("localhost") ? "http" : "https"
	const baseUrl = `${protocol}://${host}`

	return c.json({
		issuer: baseUrl,
		authorization_endpoint: `${baseUrl}/oauth/authorize`,
		token_endpoint: `${baseUrl}/oauth/token`,
		registration_endpoint: `${baseUrl}/oauth/register`,
		scopes_supported: STRAVA_SCOPES.split(","),
		response_types_supported: ["code"],
		grant_types_supported: ["authorization_code", "refresh_token"],
		token_endpoint_auth_methods_supported: ["none"],
		code_challenge_methods_supported: ["S256"],
	})
})

// ========== OAuth Endpoints ==========

// Dynamic Client Registration (RFC 7591) - MCP clients register here
app.post("/oauth/register", async c => {
	const body = await c.req.json()

	// Generate a simple client_id for this registration
	const clientId = crypto.randomUUID()

	return c.json({
		client_id: clientId,
		client_secret_expires_at: 0,
		redirect_uris: body.redirect_uris || [],
		grant_types: ["authorization_code", "refresh_token"],
		response_types: ["code"],
		token_endpoint_auth_method: "none",
	})
})

// Token endpoint - exchanges auth code for access token
app.post("/oauth/token", async c => {
	const clientId = c.env.STRAVA_CLIENT_ID
	const clientSecret = c.env.STRAVA_CLIENT_SECRET
	const stateSecret = c.env.OAUTH_STATE_SECRET

	if (!clientId || !clientSecret || !stateSecret) {
		return c.json({ error: "server_error", error_description: "OAuth not configured" }, 500)
	}

	const contentType = c.req.header("content-type") || ""
	let params: URLSearchParams

	if (contentType.includes("application/x-www-form-urlencoded")) {
		params = new URLSearchParams(await c.req.text())
	} else {
		const body = await c.req.json()
		params = new URLSearchParams(body)
	}

	const grantType = params.get("grant_type")
	const code = params.get("code")
	const refreshToken = params.get("refresh_token")

	if (grantType === "refresh_token") {
		if (!refreshToken) {
			return c.json({ error: "invalid_request", error_description: "Missing refresh_token" }, 400)
		}

		// Exchange refresh token with Strava
		const tokenResponse = await fetch(STRAVA_TOKEN_URL, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: new URLSearchParams({
				client_id: clientId,
				client_secret: clientSecret,
				grant_type: "refresh_token",
				refresh_token: refreshToken,
			}),
		})

		if (!tokenResponse.ok) {
			const errorText = await tokenResponse.text()
			console.error("Strava token refresh failed:", errorText)
			return c.json({ error: "invalid_grant", error_description: "Token refresh failed" }, 400)
		}

		const tokenData = (await tokenResponse.json()) as {
			access_token?: string
			refresh_token?: string
			expires_at?: number
			expires_in?: number
			token_type?: string
			error?: string
		}

		if (tokenData.error) {
			return c.json({ error: tokenData.error }, 400)
		}

		return c.json({
			access_token: tokenData.access_token,
			token_type: tokenData.token_type || "Bearer",
			expires_in: tokenData.expires_in,
			refresh_token: tokenData.refresh_token,
			scope: STRAVA_SCOPES,
		})
	}

	if (grantType !== "authorization_code") {
		return c.json({ error: "unsupported_grant_type" }, 400)
	}

	if (!code) {
		return c.json({ error: "invalid_request", error_description: "Missing code" }, 400)
	}

	// Decode our wrapped code to get the real Strava code
	const codeData = (await decodeState(code, stateSecret)) as {
		strava_code: string
	} | null

	if (!codeData) {
		return c.json({ error: "invalid_grant", error_description: "Invalid code" }, 400)
	}

	// Exchange with Strava
	const tokenResponse = await fetch(STRAVA_TOKEN_URL, {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: new URLSearchParams({
			client_id: clientId,
			client_secret: clientSecret,
			code: codeData.strava_code,
			grant_type: "authorization_code",
		}),
	})

	if (!tokenResponse.ok) {
		const errorText = await tokenResponse.text()
		console.error("Strava token exchange failed:", errorText)
		return c.json({ error: "invalid_grant", error_description: "Token exchange failed" }, 400)
	}

	const tokenData = (await tokenResponse.json()) as {
		access_token?: string
		refresh_token?: string
		expires_at?: number
		expires_in?: number
		token_type?: string
		athlete?: object
		error?: string
	}

	if (tokenData.error) {
		return c.json({ error: tokenData.error }, 400)
	}

	return c.json({
		access_token: tokenData.access_token,
		token_type: tokenData.token_type || "Bearer",
		expires_in: tokenData.expires_in,
		refresh_token: tokenData.refresh_token,
		scope: STRAVA_SCOPES,
	})
})

// Start OAuth flow - redirect user to Strava
app.get("/oauth/authorize", async c => {
	const clientId = c.env.STRAVA_CLIENT_ID
	const stateSecret = c.env.OAUTH_STATE_SECRET

	if (!clientId || !stateSecret) {
		return c.json({ error: "OAuth not configured" }, 500)
	}

	// Get our callback URL
	const host = c.req.header("host") || "localhost"
	const protocol = host.includes("localhost") ? "http" : "https"
	const ourCallbackUrl = `${protocol}://${host}/oauth/callback`

	// MCP client's redirect_uri and state
	const clientRedirectUri = c.req.query("redirect_uri")
	const clientState = c.req.query("state")

	// Store client's redirect_uri and state
	const state = await encodeState(
		{
			redirect_uri: clientRedirectUri,
			client_state: clientState,
			timestamp: Date.now(),
		},
		stateSecret
	)

	const authUrl = new URL(STRAVA_AUTHORIZE_URL)
	authUrl.searchParams.set("client_id", clientId)
	authUrl.searchParams.set("response_type", "code")
	authUrl.searchParams.set("redirect_uri", ourCallbackUrl)
	authUrl.searchParams.set("scope", STRAVA_SCOPES)
	authUrl.searchParams.set("state", state)
	authUrl.searchParams.set("approval_prompt", "auto")

	return c.redirect(authUrl.toString())
})

// OAuth callback - wraps Strava code and redirects to client
app.get("/oauth/callback", async c => {
	const stateSecret = c.env.OAUTH_STATE_SECRET

	if (!stateSecret) {
		return c.json({ error: "OAuth not configured" }, 500)
	}

	const code = c.req.query("code")
	const state = c.req.query("state")
	const error = c.req.query("error")

	if (error) {
		const errorDesc = c.req.query("error_description") || error
		// If we have a redirect_uri in state, redirect with error
		if (state) {
			const stateData = (await decodeState(state, stateSecret)) as { redirect_uri?: string; client_state?: string } | null
			if (stateData?.redirect_uri) {
				const redirectUrl = new URL(stateData.redirect_uri)
				redirectUrl.searchParams.set("error", error)
				if (stateData.client_state) redirectUrl.searchParams.set("state", stateData.client_state)
				return c.redirect(redirectUrl.toString())
			}
		}
		return c.json({ error: `OAuth error: ${errorDesc}` }, 400)
	}

	if (!code || !state) {
		return c.json({ error: "Missing code or state" }, 400)
	}

	const stateData = (await decodeState(state, stateSecret)) as {
		redirect_uri?: string
		client_state?: string
		timestamp?: number
	} | null

	if (!stateData) {
		return c.json({ error: "Invalid state" }, 400)
	}

	if (stateData.timestamp && Date.now() - stateData.timestamp > 10 * 60 * 1000) {
		return c.json({ error: "State expired" }, 400)
	}

	// Wrap the Strava code with our state so /oauth/token can use it
	const wrappedCode = await encodeState(
		{
			strava_code: code,
		},
		stateSecret
	)

	// Redirect to client with our wrapped code
	if (stateData.redirect_uri) {
		const redirectUrl = new URL(stateData.redirect_uri)
		redirectUrl.searchParams.set("code", wrappedCode)
		if (stateData.client_state) {
			redirectUrl.searchParams.set("state", stateData.client_state)
		}
		return c.redirect(redirectUrl.toString())
	}

	// No redirect_uri - just return the wrapped code
	return c.json({ code: wrappedCode })
})

// ========== MCP Endpoint ==========

app.post("/mcp", async c => {
	const authHeader = c.req.header("authorization")
	const accessToken = authHeader?.replace("Bearer ", "")

	if (!accessToken) {
		return c.json(
			{
				jsonrpc: "2.0",
				error: { code: -32001, message: "Missing authorization token" },
				id: null,
			},
			401
		)
	}

	const client = new StravaClient(accessToken)
	const server = new McpServer({ name: "strava", version: "1.0.0" })

	registerTools(server, client)

	const transport = new WebStandardStreamableHTTPServerTransport({
		sessionIdGenerator: undefined,
		enableJsonResponse: true,
	})

	await server.server.connect(transport)
	return transport.handleRequest(c.req.raw)
})

app.on(["GET", "DELETE"], "/mcp", c => {
	return c.json(
		{
			jsonrpc: "2.0",
			error: { code: -32000, message: "Method not allowed in stateless mode" },
			id: null,
		},
		405
	)
})

export default app