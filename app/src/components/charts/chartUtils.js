/**
 * Tally votes from an adapted poll object.
 * poll.votes = { voterName: optionLabel, ... }  (already adapted in MeetingContext)
 * poll.options = ['Voor', 'Tegen', 'Onthouding']  (label strings)
 * Returns { optionLabel: count } for all options.
 */
export function tallyVotes(poll) {
  const tally = Object.fromEntries(poll.options.map(o => [o, 0]))
  for (const optionLabel of Object.values(poll.votes ?? {})) {
    if (optionLabel in tally) tally[optionLabel]++
  }
  return tally
}
