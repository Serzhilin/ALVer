const BASE = '/api'

function getToken() {
  return localStorage.getItem('alver_token')
}

async function req(method, path, body) {
  const headers = {}
  if (body) headers['Content-Type'] = 'application/json'
  const token = getToken()
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(err.error || res.statusText)
  }
  if (res.status === 204) return null
  return res.json()
}

// ── Auth ───────────────────────────────────────────────────────────────────────
export const getAuthOffer = () => req('GET', '/auth/offer')
export const loginWithWallet = (data) => req('POST', '/auth/login', data)
export const getMe = () => req('GET', '/auth/me')

export function subscribeToAuthSession(sessionId, onLogin) {
  const es = new EventSource(`${BASE}/auth/sessions/${sessionId}`)
  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data)
      if (data.token) { onLogin(data); es.close() }
      if (data.error) es.close()
    } catch {}
  }
  return () => es.close()
}

// ── Meetings ──────────────────────────────────────────────────────────────────
export const getMeeting = (id) => req('GET', `/meetings/${id}`)
export const getAllMeetings = () => req('GET', '/meetings')
export const createMeeting = (data) => req('POST', '/meetings', data)
export const updateMeeting = (id, data) => req('PATCH', `/meetings/${id}`, data)
export const transitionStatus = (id, status) => req('PATCH', `/meetings/${id}/status`, { status })
export const getDecisions = (id) => req('GET', `/meetings/${id}/decisions`)

// ── Attendees ─────────────────────────────────────────────────────────────────
export const getAttendees = (id) => req('GET', `/meetings/${id}/attendees`)
export const preRegister = (id, name) => req('POST', `/meetings/${id}/attendees`, { name })
export const checkIn = (id, name) => req('POST', `/meetings/${id}/attendees/checkin`, { name })
export const manualAdd = (id, name, note) => req('POST', `/meetings/${id}/attendees/manual`, { name, note })

// ── Mandates ──────────────────────────────────────────────────────────────────
export const getMandates = (id) => req('GET', `/meetings/${id}/mandates`)
export const createMandate = (id, data) => req('POST', `/meetings/${id}/mandates`, data)
export const revokeMandate = (id, mandateId) => req('PATCH', `/meetings/${id}/mandates/${mandateId}/revoke`, {})

// ── Polls ─────────────────────────────────────────────────────────────────────
export const getPolls = (id) => req('GET', `/meetings/${id}/polls`)
export const createPoll = (id, data) => req('POST', `/meetings/${id}/polls`, data)
export const updatePoll = (id, pollId, data) => req('PATCH', `/meetings/${id}/polls/${pollId}`, data)
export const deletePoll = (id, pollId) => req('DELETE', `/meetings/${id}/polls/${pollId}`)
export const openPoll = (id, pollId) => req('PATCH', `/meetings/${id}/polls/${pollId}/open`, {})
export const closePoll = (id, pollId) => req('PATCH', `/meetings/${id}/polls/${pollId}/close`, {})

// ── Votes ─────────────────────────────────────────────────────────────────────
export const castVote = (pollId, data) => req('POST', `/polls/${pollId}/votes`, data)
export const manualVote = (pollId, data) => req('POST', `/polls/${pollId}/votes/manual`, data)
export const getVoteCount = (pollId) => req('GET', `/polls/${pollId}/votes/count`)
export const getResults = (pollId) => req('GET', `/polls/${pollId}/results`)
export const hasVoted = (pollId, voterName, onBehalfOf) => {
  const qs = new URLSearchParams({ voter_name: voterName, ...(onBehalfOf ? { on_behalf_of: onBehalfOf } : {}) })
  return req('GET', `/polls/${pollId}/votes/has-voted?${qs}`)
}

// ── SSE ───────────────────────────────────────────────────────────────────────
export function subscribeToMeeting(meetingId, onEvent) {
  const es = new EventSource(`${BASE}/meetings/${meetingId}/stream`)
  es.onmessage = (e) => {
    try { onEvent(JSON.parse(e.data)) } catch {}
  }
  es.onerror = () => {
    // Browser auto-reconnects; nothing to do here
  }
  return () => es.close()
}
