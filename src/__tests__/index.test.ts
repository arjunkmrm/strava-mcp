import { env, createExecutionContext, waitOnExecutionContext } from "cloudflare:test"
import { describe, it, expect } from "vitest"
import app from "../index.js"

describe("Strava MCP Server", () => {
	it("responds to health check", async () => {
		const request = new Request("http://localhost/")
		const ctx = createExecutionContext()
		const response = await app.fetch(request, env, ctx)
		await waitOnExecutionContext(ctx)

		expect(response.status).toBe(200)
		expect(await response.text()).toBe("Strava MCP server")
	})

	it("returns OAuth metadata", async () => {
		const request = new Request("http://localhost/.well-known/oauth-authorization-server")
		const ctx = createExecutionContext()
		const response = await app.fetch(request, env, ctx)
		await waitOnExecutionContext(ctx)

		expect(response.status).toBe(200)
		const data = await response.json()
		expect(data.authorization_endpoint).toContain("/oauth/authorize")
		expect(data.token_endpoint).toContain("/oauth/token")
	})

	it("returns protected resource metadata", async () => {
		const request = new Request("http://localhost/.well-known/oauth-protected-resource")
		const ctx = createExecutionContext()
		const response = await app.fetch(request, env, ctx)
		await waitOnExecutionContext(ctx)

		expect(response.status).toBe(200)
		const data = await response.json()
		expect(data.resource).toContain("/mcp")
	})

	it("rejects MCP requests without auth", async () => {
		const request = new Request("http://localhost/mcp", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ jsonrpc: "2.0", method: "initialize", id: 1 }),
		})
		const ctx = createExecutionContext()
		const response = await app.fetch(request, env, ctx)
		await waitOnExecutionContext(ctx)

		expect(response.status).toBe(401)
	})

	it("rejects GET on /mcp", async () => {
		const request = new Request("http://localhost/mcp")
		const ctx = createExecutionContext()
		const response = await app.fetch(request, env, ctx)
		await waitOnExecutionContext(ctx)

		expect(response.status).toBe(405)
	})
})