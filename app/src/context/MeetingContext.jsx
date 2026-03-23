import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import * as api from '../api/client'
import i18next from '../i18n.js'

const MeetingContext = createContext(null)

// ── Greeting strings ──────────────────────────────────────────────────────────
export function getGreeting(name) {
  const greetings = i18next.t('greetings', { returnObjects: true })
  const idx = Math.floor(Math.random() * greetings.length)
  return i18next.t(`greetings.${idx}`, { name })
}

// ── Shape helpers — adapt API response to what views expect ───────────────────
function adaptMeeting(m) {
  if (!m) return null
  // Derive active poll
  const activePoll = (m.polls || []).find(p => p.status === 'active') || null
  // Count checked-in and active mandates
  const checkedIn = (m.attendees || []).filter(a => a.status === 'checked_in')
  const mandates = (m.mandates || []).filter(mn => mn.status === 'active')

  return {
    ...m,
    // Legacy shape aliases so views work unchanged
    phase: m.status,
    agenda: m.agenda_text,
    checkedIn: checkedIn.map(a => ({
      id: a.id,
      name: a.attendee_name,
      checkedInAt: a.checked_in_at
        ? new Date(a.checked_in_at).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
        : '',
      manual: a.method === 'manual',
      isAspirant: a.is_aspirant || false,
    })),
    confirmedMandates: mandates.map(mn => ({
      id: mn.id,
      from: mn.granter_name,
      to: mn.proxy_name,
      note: mn.scope_note,
      confirmedAt: mn.granted_at
        ? new Date(mn.granted_at).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
        : '',
    })),
    preRegistrations: (m.attendees || []).map(a => ({
      id: a.id,
      name: a.attendee_name,
      type: 'attending',
    })),
    polls: (m.polls || []).map(adaptPoll),
    activePollId: activePoll?.id || null,
  }
}

function adaptPoll(p) {
  if (!p) return p
  return {
    ...p,
    title: p.motion_text,
    options: (p.vote_options || []).map(o => o.label),
    _optionIds: (p.vote_options || []).map(o => o.id),
    votes: Object.fromEntries((p.votes || []).filter(v => !v.on_behalf_of_name).map(v => [v.voter_name, v.option_id])),
    manualVotes: (p.votes || []).filter(v => v.method === 'manual').map(v => ({ id: v.id, option: v.option_id, name: v.voter_name })),
    result: p.status === 'closed' ? buildResult(p) : null,
    closedAt: p.closed_at ? new Date(p.closed_at).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) : null,
  }
}

function buildResult(p) {
  const tally = {}
  for (const opt of (p.vote_options || [])) tally[opt.label] = 0
  for (const v of (p.votes || [])) {
    const opt = (p.vote_options || []).find(o => o.id === v.option_id)
    if (opt) tally[opt.label] = (tally[opt.label] || 0) + 1
  }
  const maxVotes = Math.max(...Object.values(tally))
  const winner = Object.entries(tally).find(([, count]) => count === maxVotes)?.[0]
  const aangenomen = winner === 'Voor' || winner === 'Ja'
  return { tally, winner, aangenomen }
}

// ── Provider ──────────────────────────────────────────────────────────────────
export function MeetingProvider({ children }) {
  const [raw, setRaw] = useState(null)       // raw API response
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const meetingId = useRef(null)
  const unsubRef = useRef(null)

  // Compute derived shape
  const meeting = adaptMeeting(raw)
  const activePoll = meeting ? (meeting.polls || []).find(p => p.id === meeting.activePollId) || null : null
  const attendeeCount = meeting ? meeting.checkedIn.filter(c => !c.isAspirant).length + meeting.confirmedMandates.length : 0

  // ── Load meeting ────────────────────────────────────────────────────────────
  const load = useCallback(async (id) => {
    try {
      const m = await api.getMeeting(id)
      setRaw(m)
      setError(null)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  // Called by views to set which meeting to track
  const setMeetingId = useCallback((id) => {
    if (meetingId.current === id) return
    meetingId.current = id

    // Tear down previous SSE
    if (unsubRef.current) { unsubRef.current(); unsubRef.current = null }

    setLoading(true)
    load(id)

    // Subscribe to SSE stream
    unsubRef.current = api.subscribeToMeeting(id, (event) => {
      // Refresh full meeting state on any event
      load(id)
    })
  }, [load])

  useEffect(() => () => { if (unsubRef.current) unsubRef.current() }, [])

  // ── Actions ─────────────────────────────────────────────────────────────────
  const updatePhase = async (status) => {
    await api.transitionStatus(meetingId.current, status)
    await load(meetingId.current)
  }

  const updateMeeting = async (updates) => {
    // map legacy field names back to API shape
    const apiData = { ...updates }
    if (updates.agenda !== undefined) { apiData.agenda_text = updates.agenda; delete apiData.agenda }
    if (updates.phase !== undefined) { delete apiData.phase }
    await api.updateMeeting(meetingId.current, apiData)
    await load(meetingId.current)
  }

  const addPoll = async (poll) => {
    const options = poll.options.map(label => ({
      id: label.toLowerCase().replace(/\s+/g, '_'),
      label,
    }))
    await api.createPoll(meetingId.current, { motion_text: poll.title, vote_options: options })
    await load(meetingId.current)
  }

  const updatePollAction = async (pollId, updates) => {
    if (updates.title) updates.motion_text = updates.title
    await api.updatePoll(meetingId.current, pollId, updates)
    await load(meetingId.current)
  }

  const deletePollAction = async (pollId) => {
    await api.deletePoll(meetingId.current, pollId)
    await load(meetingId.current)
  }

  const startPoll = async (pollId) => {
    await api.openPoll(meetingId.current, pollId)
    await load(meetingId.current)
  }

  const closePollAction = async (pollId) => {
    await api.closePoll(meetingId.current, pollId)
    await load(meetingId.current)
  }

  const castVoteAction = async (pollId, voterName, optionLabel, isMandate = false, mandateFrom = null) => {
    const poll = (raw?.polls || []).find(p => p.id === pollId)
    const opt = (poll?.vote_options || []).find(o => o.label === optionLabel)
    const optionId = opt?.id ?? optionLabel.toLowerCase().replace(/\s+/g, '_')

    await api.castVote(pollId, {
      voter_name: voterName,
      option_id: optionId,
      on_behalf_of_name: isMandate ? mandateFrom : undefined,
    })
    await load(meetingId.current)
  }

  const addManualVote = async (pollId, optionLabel, name) => {
    const poll = (raw?.polls || []).find(p => p.id === pollId)
    const opt = (poll?.vote_options || []).find(o => o.label === optionLabel)
    const optionId = opt?.id ?? optionLabel.toLowerCase().replace(/\s+/g, '_')

    await api.manualVote(pollId, { voter_name: name || 'Facilitator', option_id: optionId })
    await load(meetingId.current)
  }

  const checkIn = async (name, manual = false) => {
    if (manual) {
      await api.manualAdd(meetingId.current, name)
    } else {
      await api.checkIn(meetingId.current, name)
    }
    await load(meetingId.current)
  }

  const addMandate = async (from, to, note = '') => {
    await api.createMandate(meetingId.current, {
      granter_name: from,
      proxy_name: to,
      scope_note: note,
    })
    await load(meetingId.current)
  }

  const revokeMandate = async (from) => {
    const mandate = meeting?.confirmedMandates?.find(m => m.from.toLowerCase() === from.toLowerCase())
    if (mandate) {
      await api.revokeMandate(meetingId.current, mandate.id)
      await load(meetingId.current)
    }
  }

  const resetToDefault = async () => {
    // No-op in real app — seed script handles this
    alert('Reset: run `npm run db:seed` in the terminal to reset to demo data.')
  }

  return (
    <MeetingContext.Provider value={{
      meeting,
      activePoll,
      attendeeCount,
      loading,
      error,
      setMeetingId,
      updatePhase,
      updateMeeting,
      addPoll,
      updatePoll: updatePollAction,
      deletePoll: deletePollAction,
      startPoll,
      closePoll: closePollAction,
      castVote: castVoteAction,
      addManualVote,
      checkIn,
      addMandate,
      revokeMandate,
      resetToDefault,
    }}>
      {children}
    </MeetingContext.Provider>
  )
}

export function useMeeting() {
  const ctx = useContext(MeetingContext)
  if (!ctx) throw new Error('useMeeting must be used inside MeetingProvider')
  return ctx
}
