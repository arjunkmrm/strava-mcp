import type {
	StravaAthlete,
	StravaActivity,
	StravaAthleteStats,
	StravaSegment,
	StravaClub,
	StravaRoute,
	StravaLap,
	StravaComment,
	StravaKudos,
	CreateActivityInput,
	UpdateActivityInput,
} from "./types.js"

export class StravaAPIError extends Error {
	constructor(
		message: string,
		public status: number,
		public errors?: Array<{ resource: string; field: string; code: string }>
	) {
		super(message)
		this.name = "StravaAPIError"
	}
}

export class StravaClient {
	private accessToken: string
	private apiUrl: string

	constructor(accessToken: string, apiUrl = "https://www.strava.com/api/v3") {
		this.accessToken = accessToken
		this.apiUrl = apiUrl
	}

	private async request<T>(
		method: string,
		path: string,
		body?: unknown
	): Promise<T> {
		const url = `${this.apiUrl}${path}`

		const response = await fetch(url, {
			method,
			headers: {
				Authorization: `Bearer ${this.accessToken}`,
				"Content-Type": "application/json",
			},
			body: body ? JSON.stringify(body) : undefined,
		})

		if (!response.ok) {
			const errorText = await response.text()
			let errorMessage = `Strava API error: ${response.status}`
			let errors: Array<{ resource: string; field: string; code: string }> | undefined

			try {
				const errorData = JSON.parse(errorText)
				errorMessage = errorData.message || errorMessage
				errors = errorData.errors
			} catch {
				errorMessage = errorText || errorMessage
			}

			throw new StravaAPIError(errorMessage, response.status, errors)
		}

		if (response.status === 204) {
			return {} as T
		}

		return response.json() as Promise<T>
	}

	// ========== Athlete ==========

	async getAuthenticatedAthlete(): Promise<StravaAthlete> {
		return this.request("GET", "/athlete")
	}

	async getAthleteStats(athleteId: number): Promise<StravaAthleteStats> {
		return this.request("GET", `/athletes/${athleteId}/stats`)
	}

	async updateAthlete(weight: number): Promise<StravaAthlete> {
		return this.request("PUT", `/athlete?weight=${weight}`)
	}

	// ========== Activities ==========

	async getActivity(id: number, includeAllEfforts = false): Promise<StravaActivity> {
		const params = includeAllEfforts ? "?include_all_efforts=true" : ""
		return this.request("GET", `/activities/${id}${params}`)
	}

	async listAthleteActivities(options: {
		before?: number
		after?: number
		page?: number
		per_page?: number
	} = {}): Promise<StravaActivity[]> {
		const params = new URLSearchParams()
		if (options.before) params.set("before", options.before.toString())
		if (options.after) params.set("after", options.after.toString())
		if (options.page) params.set("page", options.page.toString())
		if (options.per_page) params.set("per_page", options.per_page.toString())

		const query = params.toString()
		return this.request("GET", `/athlete/activities${query ? `?${query}` : ""}`)
	}

	async createActivity(input: CreateActivityInput): Promise<StravaActivity> {
		const params = new URLSearchParams()
		params.set("name", input.name)
		params.set("sport_type", input.sport_type)
		params.set("start_date_local", input.start_date_local)
		params.set("elapsed_time", input.elapsed_time.toString())
		if (input.description) params.set("description", input.description)
		if (input.distance) params.set("distance", input.distance.toString())
		if (input.trainer !== undefined) params.set("trainer", input.trainer ? "1" : "0")
		if (input.commute !== undefined) params.set("commute", input.commute ? "1" : "0")

		return this.request("POST", `/activities?${params.toString()}`)
	}

	async updateActivity(id: number, input: UpdateActivityInput): Promise<StravaActivity> {
		return this.request("PUT", `/activities/${id}`, input)
	}

	async getActivityLaps(id: number): Promise<StravaLap[]> {
		return this.request("GET", `/activities/${id}/laps`)
	}

	async getActivityComments(id: number, options: {
		page?: number
		per_page?: number
	} = {}): Promise<StravaComment[]> {
		const params = new URLSearchParams()
		if (options.page) params.set("page", options.page.toString())
		if (options.per_page) params.set("per_page", options.per_page.toString())

		const query = params.toString()
		return this.request("GET", `/activities/${id}/comments${query ? `?${query}` : ""}`)
	}

	async getActivityKudos(id: number, options: {
		page?: number
		per_page?: number
	} = {}): Promise<StravaKudos[]> {
		const params = new URLSearchParams()
		if (options.page) params.set("page", options.page.toString())
		if (options.per_page) params.set("per_page", options.per_page.toString())

		const query = params.toString()
		return this.request("GET", `/activities/${id}/kudos${query ? `?${query}` : ""}`)
	}

	// ========== Segments ==========

	async getSegment(id: number): Promise<StravaSegment> {
		return this.request("GET", `/segments/${id}`)
	}

	async starSegment(id: number, starred: boolean): Promise<StravaSegment> {
		return this.request("PUT", `/segments/${id}/starred`, { starred })
	}

	async listStarredSegments(options: {
		page?: number
		per_page?: number
	} = {}): Promise<StravaSegment[]> {
		const params = new URLSearchParams()
		if (options.page) params.set("page", options.page.toString())
		if (options.per_page) params.set("per_page", options.per_page.toString())

		const query = params.toString()
		return this.request("GET", `/segments/starred${query ? `?${query}` : ""}`)
	}

	async exploreSegments(bounds: [number, number, number, number], options: {
		activity_type?: "running" | "riding"
		min_cat?: number
		max_cat?: number
	} = {}): Promise<{ segments: StravaSegment[] }> {
		const params = new URLSearchParams()
		params.set("bounds", bounds.join(","))
		if (options.activity_type) params.set("activity_type", options.activity_type)
		if (options.min_cat !== undefined) params.set("min_cat", options.min_cat.toString())
		if (options.max_cat !== undefined) params.set("max_cat", options.max_cat.toString())

		return this.request("GET", `/segments/explore?${params.toString()}`)
	}

	// ========== Clubs ==========

	async getClub(id: number): Promise<StravaClub> {
		return this.request("GET", `/clubs/${id}`)
	}

	async listAthleteClubs(options: {
		page?: number
		per_page?: number
	} = {}): Promise<StravaClub[]> {
		const params = new URLSearchParams()
		if (options.page) params.set("page", options.page.toString())
		if (options.per_page) params.set("per_page", options.per_page.toString())

		const query = params.toString()
		return this.request("GET", `/athlete/clubs${query ? `?${query}` : ""}`)
	}

	async listClubMembers(id: number, options: {
		page?: number
		per_page?: number
	} = {}): Promise<StravaAthlete[]> {
		const params = new URLSearchParams()
		if (options.page) params.set("page", options.page.toString())
		if (options.per_page) params.set("per_page", options.per_page.toString())

		const query = params.toString()
		return this.request("GET", `/clubs/${id}/members${query ? `?${query}` : ""}`)
	}

	async listClubActivities(id: number, options: {
		page?: number
		per_page?: number
	} = {}): Promise<StravaActivity[]> {
		const params = new URLSearchParams()
		if (options.page) params.set("page", options.page.toString())
		if (options.per_page) params.set("per_page", options.per_page.toString())

		const query = params.toString()
		return this.request("GET", `/clubs/${id}/activities${query ? `?${query}` : ""}`)
	}

	// ========== Routes ==========

	async getRoute(id: number): Promise<StravaRoute> {
		return this.request("GET", `/routes/${id}`)
	}

	async listAthleteRoutes(athleteId: number, options: {
		page?: number
		per_page?: number
	} = {}): Promise<StravaRoute[]> {
		const params = new URLSearchParams()
		if (options.page) params.set("page", options.page.toString())
		if (options.per_page) params.set("per_page", options.per_page.toString())

		const query = params.toString()
		return this.request("GET", `/athletes/${athleteId}/routes${query ? `?${query}` : ""}`)
	}

	// ========== Gear ==========

	async getGear(id: string): Promise<{
		id: string
		primary: boolean
		name: string
		nickname: string
		distance: number
		brand_name: string
		model_name: string
		description: string
	}> {
		return this.request("GET", `/gear/${id}`)
	}
}