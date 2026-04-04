/**
 * Renders agenda HTML safely. Always use this — never render meeting.agenda as
 * plain text or in a <pre>, as the editor produces rich HTML.
 */
export default function AgendaHtml({ html, style }) {
  if (!html) return null
  return (
    <div
      className="agenda-html"
      style={style}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
