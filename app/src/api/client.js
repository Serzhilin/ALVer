const BASE = '/api'

// SSE connections bypass Vite's dev proxy — it buffers chunks until connection closes,
// making real-time events only appear on page reload. In dev we connect directly to the
// API port. In production there is no proxy so /api works fine.
const SSE_BASE = import.meta.env.DEV
  ? `http://localhost:${import.meta.env.VITE_API_PORT || 3001}/api`
  : '/api'

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
export const getAuthOffer = (returnTo) => req('GET', `/auth/offer${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ''}`)
export const loginWithWallet = (data) => req('POST', '/auth/login', data)
export const devLogin = () => req('POST', '/auth/dev-login')
export const getMe = (communityId) => req('GET', `/auth/me${communityId ? `?communityId=${encodeURIComponent(communityId)}` : ''}`)
export const getCommunities = () => req('GET', '/auth/communities')

export function subscribeToAuthSession(sessionId, onLogin) {
  const es = new EventSource(`${SSE_BASE}/auth/sessions/${sessionId}`)
  es.onmessage = (e) => {
    try {
      const data = JSON.parse(e.data)
      if (data.token) { onLogin(data); es.close() }
      if (data.error) es.close()
    } catch {}
  }
  return () => es.close()
}

export const pollAuthSessionResult = (sessionId) =>
  fetch(`${BASE}/auth/sessions/${sessionId}/result`).then(r => r.status === 200 ? r.json() : null)

// ── Community ─────────────────────────────────────────────────────────────────
export const getCommunityBranding = () => req('GET', '/community/branding')
export const getCommunity = (communityId) => req('GET', `/community${communityId ? `?communityId=${encodeURIComponent(communityId)}` : ''}`)
export const updateCommunity = (data) => req('PATCH', '/community', data)
export const getCommunityMembers = () => req('GET', '/community/members')
export const createCommunityMember = (data) => req('POST', '/community/members', data)
export const updateCommunityMember = (id, data) => req('PATCH', `/community/members/${id}`, data)
export const deleteCommunityMember = (id) => req('DELETE', `/community/members/${id}`)

// ── Meetings ──────────────────────────────────────────────────────────────────
export const getMeetingMembers = (id) => req('GET', `/meetings/${id}/members`)
export const getMeeting = (id) => req('GET', `/meetings/${id}`)
export const getAllMeetings = (communityId) => req('GET', `/meetings${communityId ? `?communityId=${encodeURIComponent(communityId)}` : ''}`)
export const createMeeting = (data) => req('POST', '/meetings', data)
export const updateMeeting = (id, data) => req('PATCH', `/meetings/${id}`, data)
export const deleteMeeting = (id) => req('DELETE', `/meetings/${id}`)
export const transitionStatus = (id, status) => req('PATCH', `/meetings/${id}/status`, { status })
export const reopenMeeting = (id) => req('POST', `/meetings/${id}/reopen`)
export const getDecisions = (id) => req('GET', `/meetings/${id}/decisions`)

// ── Attendees ─────────────────────────────────────────────────────────────────
export const getAttendees = (id) => req('GET', `/meetings/${id}/attendees`)
export const preRegister = (id, name) => req('POST', `/meetings/${id}/attendees`, { name })
export const checkIn = (id, name) => req('POST', `/meetings/${id}/attendees/checkin`, { name })
export const manualAdd = (id, name, note) => req('POST', `/meetings/${id}/attendees/manual`, { name, note })
export const deleteAttendee = (meetingId, attendeeId) => req('DELETE', `/meetings/${meetingId}/attendees/${attendeeId}`)

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
// Safari on iOS kills EventSource when the tab is backgrounded or screen locks.
// We reconnect automatically: on error (with 3s delay) and on visibilitychange.
export function subscribeToMeeting(meetingId, onEvent, { onDisconnect, onReconnect } = {}) {
  let es = null
  let retryTimer = null
  let destroyed = false

  function connect() {
    if (destroyed) return
    es = new EventSource(`${SSE_BASE}/meetings/${meetingId}/stream`)
    es.onopen = () => { onReconnect?.() }
    es.onmessage = (e) => {
      try { onEvent(JSON.parse(e.data)) } catch {}
    }
    es.onerror = () => {
      onDisconnect?.()
      es.close()
      if (!destroyed) retryTimer = setTimeout(connect, 3000)
    }
  }

  function onVisible() {
    if (document.visibilityState === 'visible') {
      clearTimeout(retryTimer)
      if (es) es.close()
      connect()
    }
  }

  document.addEventListener('visibilitychange', onVisible)
  connect()

  return () => {
    destroyed = true
    clearTimeout(retryTimer)
    document.removeEventListener('visibilitychange', onVisible)
    if (es) es.close()
  }
}

// ── Admin API (uses same token as facilitator login) ──────────────────────────
export const adminListCommunities = () => req('GET', '/admin/communities')
export const adminCreateCommunity = (data) => req('POST', '/admin/communities', data)
export const adminDeleteCommunity = (id) => req('DELETE', `/admin/communities/${id}`)
