/**
 * Tally votes from an adapted poll object.
 * poll.votes = { voterName: option_id, ... }  (adapted in MeetingContext — values are option IDs)
 * poll.options = ['Voor', 'Tegen', 'Onthouding']  (label strings, parallel array with _optionIds)
 * poll._optionIds = ['voor', 'tegen', 'onthouding']  (id strings, parallel array with options)
 * Returns { optionLabel: count } for all options.
 *
 * Note: on-behalf-of (mandate) votes are excluded from poll.votes by the adapter.
 * They have no per-option breakdown, so the tally reflects direct votes only.
 */
export function tallyVotes(poll) {
  const tally = Object.fromEntries(poll.options.map(o => [o, 0]))
  for (const optionId of Object.values(poll.votes ?? {})) {
    const idx = poll._optionIds?.indexOf(optionId)
    if (idx != null && idx !== -1) tally[poll.options[idx]]++
  }
  return tally
}
