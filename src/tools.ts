import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { z } from "zod"
import { StravaClient, StravaAPIError } from "./api.js"

function formatResult(data: unknown): string {
	return JSON.stringify(data, null, 2)
}

function formatDistance(meters: number): string {
	if (meters >= 1000) {
		return `${(meters / 1000).toFixed(2)} km`
	}
	return `${meters.toFixed(0)} m`
}

function formatDuration(seconds: number): string {
	const hours = Math.floor(seconds / 3600)
	const minutes = Math.floor((seconds % 3600) / 60)
	const secs = seconds % 60
	if (hours > 0) {
		return `${hours}h ${minutes}m ${secs}s`
	}
	if (minutes > 0) {
		return `${minutes}m ${secs}s`
	}
	return `${secs}s`
}

function pickAthlete(athlete: Record<string, unknown>) {
	return {
		id: athlete.id,
		username: athlete.username,
		name: `${athlete.firstname} ${athlete.lastname}`,
		city: athlete.city,
		country: athlete.country,
		premium: athlete.premium,
		profile: athlete.profile,
	}
}

function pickActivity(activity: Record<string, unknown>) {
	return {
		id: activity.id,
		name: activity.name,
		type: activity.sport_type || activity.type,
		distance: formatDistance(activity.distance as number),
		moving_time: formatDuration(activity.moving_time as number),
		elevation_gain: `${activity.total_elevation_gain} m`,
		start_date: activity.start_date_local,
		kudos: activity.kudos_count,
		comments: activity.comment_count,
		achievements: activity.achievement_count,
		avg_speed: `${((activity.average_speed as number) * 3.6).toFixed(1)} km/h`,
		max_speed: `${((activity.max_speed as number) * 3.6).toFixed(1)} km/h`,
		calories: activity.calories,
		description: activity.description,
	}
}

function pickSegment(segment: Record<string, unknown>) {
	return {
		id: segment.id,
		name: segment.name,
		activity_type: segment.activity_type,
		distance: formatDistance(segment.distance as number),
		avg_grade: `${segment.average_grade}%`,
		max_grade: `${segment.maximum_grade}%`,
		elevation: `${segment.elevation_low}m - ${segment.elevation_high}m`,
		climb_category: segment.climb_category,
		city: segment.city,
		country: segment.country,
		starred: segment.starred,
	}
}

function pickClub(club: Record<string, unknown>) {
	return {
		id: club.id,
		name: club.name,
		sport_type: club.sport_type,
		city: club.city,
		country: club.country,
		member_count: club.member_count,
		private: club.private,
		verified: club.verified,
		url: club.url,
	}
}

function pickRoute(route: Record<string, unknown>) {
	return {
		id: route.id,
		name: route.name,
		distance: formatDistance(route.distance as number),
		elevation_gain: `${route.elevation_gain} m`,
		description: route.description,
		private: route.private,
		starred: route.starred,
	}
}

function handleError(error: unknown): { content: Array<{ type: "text"; text: string }> } {
	if (error instanceof StravaAPIError) {
		let message = `Strava API Error (${error.status}): ${error.message}`
		if (error.errors) {
			message += `\nErrors: ${JSON.stringify(error.errors)}`
		}
		return {
			content: [{ type: "text" as const, text: message }],
		}
	}
	return {
		content: [
			{
				type: "text" as const,
				text: `Error: ${error instanceof Error ? error.message : String(error)}`,
			},
		],
	}
}

export function registerTools(server: McpServer, client: StravaClient): void {
	// ========== Athlete Tools ==========

	server.registerTool(
		"get_athlete",
		{
			title: "Get Authenticated Athlete",
			description: "Get the currently authenticated athlete's profile",
			inputSchema: {},
		},
		async () => {
			try {
				const athlete = await client.getAuthenticatedAthlete()
				return {
					content: [{ type: "text" as const, text: formatResult(pickAthlete(athlete as unknown as Record<string, unknown>)) }],
				}
			} catch (error) {
				return handleError(error)
			}
		}
	)

	server.registerTool(
		"get_athlete_stats",
		{
			title: "Get Athlete Stats",
			description: "Get activity statistics for the authenticated athlete",
			inputSchema: {
				athlete_id: z.number().describe("The athlete ID"),
			},
		},
		async ({ athlete_id }) => {
			try {
				const stats = await client.getAthleteStats(athlete_id)
				return {
					content: [{ type: "text" as const, text: formatResult(stats) }],
				}
			} catch (error) {
				return handleError(error)
			}
		}
	)

	// ========== Activity Tools ==========

	server.registerTool(
		"list_activities",
		{
			title: "List Activities",
			description: "List the authenticated athlete's activities",
			inputSchema: {
				before: z.number().optional().describe("Unix timestamp to filter activities before this time"),
				after: z.number().optional().describe("Unix timestamp to filter activities after this time"),
				page: z.number().optional().describe("Page number (default: 1)"),
				per_page: z.number().optional().describe("Number of items per page (default: 30, max: 200)"),
			},
		},
		async ({ before, after, page, per_page }) => {
			try {
				const activities = await client.listAthleteActivities({ before, after, page, per_page })
				const picked = activities.map(a => pickActivity(a as unknown as Record<string, unknown>))
				return {
					content: [{ type: "text" as const, text: formatResult(picked) }],
				}
			} catch (error) {
				return handleError(error)
			}
		}
	)

	server.registerTool(
		"get_activity",
		{
			title: "Get Activity",
			description: "Get detailed information about a specific activity",
			inputSchema: {
				id: z.number().describe("The activity ID"),
				include_all_efforts: z.boolean().optional().describe("Include all segment efforts"),
			},
		},
		async ({ id, include_all_efforts }) => {
			try {
				const activity = await client.getActivity(id, include_all_efforts)
				return {
					content: [{ type: "text" as const, text: formatResult(pickActivity(activity as unknown as Record<string, unknown>)) }],
				}
			} catch (error) {
				return handleError(error)
			}
		}
	)

	server.registerTool(
		"create_activity",
		{
			title: "Create Activity",
			description: "Create a manual activity",
			inputSchema: {
				name: z.string().describe("Activity name"),
				sport_type: z.string().describe("Sport type (e.g., Run, Ride, Swim, Hike, Walk, Workout)"),
				start_date_local: z.string().describe("ISO 8601 formatted date time (e.g., 2024-01-15T10:00:00Z)"),
				elapsed_time: z.number().describe("Activity duration in seconds"),
				description: z.string().optional().describe("Activity description"),
				distance: z.number().optional().describe("Distance in meters"),
				trainer: z.boolean().optional().describe("Whether this was a trainer activity"),
				commute: z.boolean().optional().describe("Whether this was a commute"),
			},
		},
		async ({ name, sport_type, start_date_local, elapsed_time, description, distance, trainer, commute }) => {
			try {
				const activity = await client.createActivity({
					name,
					sport_type,
					start_date_local,
					elapsed_time,
					description,
					distance,
					trainer,
					commute,
				})
				return {
					content: [{ type: "text" as const, text: formatResult(pickActivity(activity as unknown as Record<string, unknown>)) }],
				}
			} catch (error) {
				return handleError(error)
			}
		}
	)

	server.registerTool(
		"update_activity",
		{
			title: "Update Activity",
			description: "Update an existing activity",
			inputSchema: {
				id: z.number().describe("The activity ID"),
				name: z.string().optional().describe("New activity name"),
				sport_type: z.string().optional().describe("New sport type"),
				description: z.string().optional().describe("New description"),
				gear_id: z.string().optional().describe("Gear ID to associate"),
				trainer: z.boolean().optional().describe("Whether this was a trainer activity"),
				commute: z.boolean().optional().describe("Whether this was a commute"),
			},
		},
		async ({ id, name, sport_type, description, gear_id, trainer, commute }) => {
			try {
				const activity = await client.updateActivity(id, {
					name,
					sport_type,
					description,
					gear_id,
					trainer,
					commute,
				})
				return {
					content: [{ type: "text" as const, text: formatResult(pickActivity(activity as unknown as Record<string, unknown>)) }],
				}
			} catch (error) {
				return handleError(error)
			}
		}
	)

	server.registerTool(
		"get_activity_laps",
		{
			title: "Get Activity Laps",
			description: "Get laps for an activity",
			inputSchema: {
				id: z.number().describe("The activity ID"),
			},
		},
		async ({ id }) => {
			try {
				const laps = await client.getActivityLaps(id)
				return {
					content: [{ type: "text" as const, text: formatResult(laps) }],
				}
			} catch (error) {
				return handleError(error)
			}
		}
	)

	server.registerTool(
		"get_activity_comments",
		{
			title: "Get Activity Comments",
			description: "Get comments on an activity",
			inputSchema: {
				id: z.number().describe("The activity ID"),
				page: z.number().optional().describe("Page number"),
				per_page: z.number().optional().describe("Items per page"),
			},
		},
		async ({ id, page, per_page }) => {
			try {
				const comments = await client.getActivityComments(id, { page, per_page })
				return {
					content: [{ type: "text" as const, text: formatResult(comments) }],
				}
			} catch (error) {
				return handleError(error)
			}
		}
	)

	server.registerTool(
		"get_activity_kudos",
		{
			title: "Get Activity Kudos",
			description: "Get kudos on an activity",
			inputSchema: {
				id: z.number().describe("The activity ID"),
				page: z.number().optional().describe("Page number"),
				per_page: z.number().optional().describe("Items per page"),
			},
		},
		async ({ id, page, per_page }) => {
			try {
				const kudos = await client.getActivityKudos(id, { page, per_page })
				return {
					content: [{ type: "text" as const, text: formatResult(kudos) }],
				}
			} catch (error) {
				return handleError(error)
			}
		}
	)

	// ========== Segment Tools ==========

	server.registerTool(
		"get_segment",
		{
			title: "Get Segment",
			description: "Get details about a specific segment",
			inputSchema: {
				id: z.number().describe("The segment ID"),
			},
		},
		async ({ id }) => {
			try {
				const segment = await client.getSegment(id)
				return {
					content: [{ type: "text" as const, text: formatResult(pickSegment(segment as unknown as Record<string, unknown>)) }],
				}
			} catch (error) {
				return handleError(error)
			}
		}
	)

	server.registerTool(
		"list_starred_segments",
		{
			title: "List Starred Segments",
			description: "List the authenticated athlete's starred segments",
			inputSchema: {
				page: z.number().optional().describe("Page number"),
				per_page: z.number().optional().describe("Items per page"),
			},
		},
		async ({ page, per_page }) => {
			try {
				const segments = await client.listStarredSegments({ page, per_page })
				const picked = segments.map(s => pickSegment(s as unknown as Record<string, unknown>))
				return {
					content: [{ type: "text" as const, text: formatResult(picked) }],
				}
			} catch (error) {
				return handleError(error)
			}
		}
	)

	server.registerTool(
		"explore_segments",
		{
			title: "Explore Segments",
			description: "Find popular segments within a geographic area",
			inputSchema: {
				south_west_lat: z.number().describe("Southwest corner latitude"),
				south_west_lng: z.number().describe("Southwest corner longitude"),
				north_east_lat: z.number().describe("Northeast corner latitude"),
				north_east_lng: z.number().describe("Northeast corner longitude"),
				activity_type: z.enum(["running", "riding"]).optional().describe("Filter by activity type"),
				min_cat: z.number().optional().describe("Minimum climb category (0-5)"),
				max_cat: z.number().optional().describe("Maximum climb category (0-5)"),
			},
		},
		async ({ south_west_lat, south_west_lng, north_east_lat, north_east_lng, activity_type, min_cat, max_cat }) => {
			try {
				const result = await client.exploreSegments(
					[south_west_lat, south_west_lng, north_east_lat, north_east_lng],
					{ activity_type, min_cat, max_cat }
				)
				const picked = result.segments.map(s => pickSegment(s as unknown as Record<string, unknown>))
				return {
					content: [{ type: "text" as const, text: formatResult(picked) }],
				}
			} catch (error) {
				return handleError(error)
			}
		}
	)

	server.registerTool(
		"star_segment",
		{
			title: "Star/Unstar Segment",
			description: "Star or unstar a segment",
			inputSchema: {
				id: z.number().describe("The segment ID"),
				starred: z.boolean().describe("Whether to star (true) or unstar (false)"),
			},
		},
		async ({ id, starred }) => {
			try {
				const segment = await client.starSegment(id, starred)
				return {
					content: [{ type: "text" as const, text: formatResult(pickSegment(segment as unknown as Record<string, unknown>)) }],
				}
			} catch (error) {
				return handleError(error)
			}
		}
	)

	// ========== Club Tools ==========

	server.registerTool(
		"list_clubs",
		{
			title: "List Athlete Clubs",
			description: "List clubs the authenticated athlete is a member of",
			inputSchema: {
				page: z.number().optional().describe("Page number"),
				per_page: z.number().optional().describe("Items per page"),
			},
		},
		async ({ page, per_page }) => {
			try {
				const clubs = await client.listAthleteClubs({ page, per_page })
				const picked = clubs.map(c => pickClub(c as unknown as Record<string, unknown>))
				return {
					content: [{ type: "text" as const, text: formatResult(picked) }],
				}
			} catch (error) {
				return handleError(error)
			}
		}
	)

	server.registerTool(
		"get_club",
		{
			title: "Get Club",
			description: "Get details about a specific club",
			inputSchema: {
				id: z.number().describe("The club ID"),
			},
		},
		async ({ id }) => {
			try {
				const club = await client.getClub(id)
				return {
					content: [{ type: "text" as const, text: formatResult(pickClub(club as unknown as Record<string, unknown>)) }],
				}
			} catch (error) {
				return handleError(error)
			}
		}
	)

	server.registerTool(
		"list_club_members",
		{
			title: "List Club Members",
			description: "List members of a club",
			inputSchema: {
				id: z.number().describe("The club ID"),
				page: z.number().optional().describe("Page number"),
				per_page: z.number().optional().describe("Items per page"),
			},
		},
		async ({ id, page, per_page }) => {
			try {
				const members = await client.listClubMembers(id, { page, per_page })
				const picked = members.map(m => pickAthlete(m as unknown as Record<string, unknown>))
				return {
					content: [{ type: "text" as const, text: formatResult(picked) }],
				}
			} catch (error) {
				return handleError(error)
			}
		}
	)

	server.registerTool(
		"list_club_activities",
		{
			title: "List Club Activities",
			description: "List recent activities from club members",
			inputSchema: {
				id: z.number().describe("The club ID"),
				page: z.number().optional().describe("Page number"),
				per_page: z.number().optional().describe("Items per page"),
			},
		},
		async ({ id, page, per_page }) => {
			try {
				const activities = await client.listClubActivities(id, { page, per_page })
				const picked = activities.map(a => pickActivity(a as unknown as Record<string, unknown>))
				return {
					content: [{ type: "text" as const, text: formatResult(picked) }],
				}
			} catch (error) {
				return handleError(error)
			}
		}
	)

	// ========== Route Tools ==========

	server.registerTool(
		"get_route",
		{
			title: "Get Route",
			description: "Get details about a specific route",
			inputSchema: {
				id: z.number().describe("The route ID"),
			},
		},
		async ({ id }) => {
			try {
				const route = await client.getRoute(id)
				return {
					content: [{ type: "text" as const, text: formatResult(pickRoute(route as unknown as Record<string, unknown>)) }],
				}
			} catch (error) {
				return handleError(error)
			}
		}
	)

	server.registerTool(
		"list_athlete_routes",
		{
			title: "List Athlete Routes",
			description: "List routes created by an athlete",
			inputSchema: {
				athlete_id: z.number().describe("The athlete ID"),
				page: z.number().optional().describe("Page number"),
				per_page: z.number().optional().describe("Items per page"),
			},
		},
		async ({ athlete_id, page, per_page }) => {
			try {
				const routes = await client.listAthleteRoutes(athlete_id, { page, per_page })
				const picked = routes.map(r => pickRoute(r as unknown as Record<string, unknown>))
				return {
					content: [{ type: "text" as const, text: formatResult(picked) }],
				}
			} catch (error) {
				return handleError(error)
			}
		}
	)

	// ========== Gear Tools ==========

	server.registerTool(
		"get_gear",
		{
			title: "Get Gear",
			description: "Get details about a specific piece of gear",
			inputSchema: {
				id: z.string().describe("The gear ID"),
			},
		},
		async ({ id }) => {
			try {
				const gear = await client.getGear(id)
				return {
					content: [{ type: "text" as const, text: formatResult(gear) }],
				}
			} catch (error) {
				return handleError(error)
			}
		}
	)
}