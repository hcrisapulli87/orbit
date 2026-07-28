// Deliberately dependency-free.
//
// `store` imports `seed` (to build the tables) and `seed` imports these two
// constants. Keeping them in a leaf module breaks the cycle — otherwise `seed`
// evaluates first and reads the owner id before `store` has initialised it.

export const DEMO_OWNER_ID = '00000000-dem0-4000-8000-000000000001'
export const DEMO_EMAIL = 'demo@orbit.app'
