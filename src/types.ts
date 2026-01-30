// Strava API Types

export interface StravaAthlete {
	id: number
	username: string
	firstname: string
	lastname: string
	bio: string | null
	city: string | null
	state: string | null
	country: string | null
	sex: "M" | "F" | null
	premium: boolean
	summit: boolean
	created_at: string
	updated_at: string
	profile_medium: string
	profile: string
	follower_count?: number
	friend_count?: number
	measurement_preference?: "feet" | "meters"
	weight?: number
}

export interface StravaActivity {
	id: number
	name: string
	distance: number
	moving_time: number
	elapsed_time: number
	total_elevation_gain: number
	type: string
	sport_type: string
	start_date: string
	start_date_local: string
	timezone: string
	utc_offset: number
	start_latlng: [number, number] | null
	end_latlng: [number, number] | null
	achievement_count: number
	kudos_count: number
	comment_count: number
	athlete_count: number
	photo_count: number
	map: {
		id: string
		summary_polyline: string | null
		polyline?: string
	}
	trainer: boolean
	commute: boolean
	manual: boolean
	private: boolean
	visibility: string
	flagged: boolean
	gear_id: string | null
	average_speed: number
	max_speed: number
	average_cadence?: number
	average_temp?: number
	average_watts?: number
	weighted_average_watts?: number
	kilojoules?: number
	device_watts?: boolean
	has_heartrate: boolean
	average_heartrate?: number
	max_heartrate?: number
	max_watts?: number
	pr_count: number
	suffer_score?: number
	calories?: number
	description?: string
	workout_type?: number
	gear?: StravaGear
}

export interface StravaGear {
	id: string
	primary: boolean
	name: string
	distance: number
}

export interface StravaAthleteStats {
	biggest_ride_distance: number
	biggest_climb_elevation_gain: number
	recent_ride_totals: StravaTotals
	all_ride_totals: StravaTotals
	recent_run_totals: StravaTotals
	all_run_totals: StravaTotals
	recent_swim_totals: StravaTotals
	all_swim_totals: StravaTotals
	ytd_ride_totals: StravaTotals
	ytd_run_totals: StravaTotals
	ytd_swim_totals: StravaTotals
}

export interface StravaTotals {
	count: number
	distance: number
	moving_time: number
	elapsed_time: number
	elevation_gain: number
	achievement_count?: number
}

export interface StravaSegment {
	id: number
	name: string
	activity_type: string
	distance: number
	average_grade: number
	maximum_grade: number
	elevation_high: number
	elevation_low: number
	start_latlng: [number, number]
	end_latlng: [number, number]
	climb_category: number
	city: string | null
	state: string | null
	country: string | null
	private: boolean
	hazardous: boolean
	starred: boolean
}

export interface StravaClub {
	id: number
	name: string
	profile_medium: string
	profile: string
	cover_photo: string | null
	cover_photo_small: string | null
	sport_type: string
	city: string
	state: string
	country: string
	private: boolean
	member_count: number
	featured: boolean
	verified: boolean
	url: string
	description?: string
}

export interface StravaRoute {
	id: number
	name: string
	description: string | null
	athlete: { id: number }
	distance: number
	elevation_gain: number
	type: number
	sub_type: number
	private: boolean
	starred: boolean
	timestamp: number
	map: {
		id: string
		summary_polyline: string
		polyline?: string
	}
}

export interface StravaLap {
	id: number
	activity: { id: number }
	athlete: { id: number }
	name: string
	elapsed_time: number
	moving_time: number
	start_date: string
	start_date_local: string
	distance: number
	average_speed: number
	max_speed: number
	lap_index: number
	split: number
}

export interface StravaComment {
	id: number
	activity_id: number
	text: string
	athlete: StravaAthlete
	created_at: string
}

export interface StravaKudos {
	firstname: string
	lastname: string
}

export interface CreateActivityInput {
	name: string
	sport_type: string
	start_date_local: string
	elapsed_time: number
	description?: string
	distance?: number
	trainer?: boolean
	commute?: boolean
}

export interface UpdateActivityInput {
	name?: string
	sport_type?: string
	description?: string
	gear_id?: string
	trainer?: boolean
	commute?: boolean
	hide_from_home?: boolean
}