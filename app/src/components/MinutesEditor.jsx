import { useState, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useTranslation } from 'react-i18next'
import { saveMinutes, publishMinutes } from '../api/client'

/**
 * Editor for draft minutes — shown to the notulist and facilitator.
 * Manages its own TipTap instance so state updates never fire during the
 * parent (Archive) render cycle, avoiding React error #310.
 */
export default function MinutesEditor({ meeting, onPublished }) {
  const { t } = useTranslation()
  const [saving, setSaving] = useState(false)
  const [publishConfirm, setPublishConfirm] = useState(false)
  const saveTimerRef = useRef(null)

  const editor = useEditor({
    extensions: [StarterKit],
    content: meeting.minutes_html ?? '',
    onBlur: ({ editor: ed }) => {
      clearTimeout(saveTimerRef.current)
      doSave(ed)
    },
    onUpdate: ({ editor: ed }) => {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => doSave(ed), 30000)
    },
  })

  async function doSave(ed) {
    if (!ed) return
    setSaving(true)
    try {
      await saveMinutes(meeting.id, ed.getHTML())
    } catch (err) {
      console.warn('Auto-save failed:', err)
    } finally {
      setSaving(false)
    }
  }

  async function handlePublish() {
    try {
      await publishMinutes(meeting.id)
      setPublishConfirm(false)
      onPublished?.()
    } catch (err) {
      console.warn('Publish failed:', err)
    }
  }

  async function handleImportDocx(e) {
    const file = e.target.files?.[0]
    if (!file || !editor) return
    if (editor.getText().trim().length > 0) {
      if (!window.confirm(t('minutes.import_replace_confirm'))) {
        e.target.value = ''
        return
      }
    }
    try {
      const mammoth = await import('mammoth/mammoth.browser')
      const arrayBuffer = await file.arrayBuffer()
      const result = await mammoth.convertToHtml({ arrayBuffer })
      editor.commands.setContent(result.value)
      doSave(editor)
    } catch (err) {
      console.warn('Import failed:', err)
    }
    e.target.value = ''
  }

  if (!editor) return null

  return (
    <div className="card" style={{ padding: 24 }}>
      {/* Import from Word */}
      <div style={{ marginBottom: 16 }}>
        <label
          htmlFor="docx-import"
          className="btn-secondary"
          style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem' }}
        >
          📄 {t('minutes.import_word')}
        </label>
        <input
          id="docx-import"
          type="file"
          accept=".docx"
          style={{ display: 'none' }}
          onChange={handleImportDocx}
        />
      </div>

      {/* TipTap editor */}
      <div style={{ border: '1px solid var(--color-sand-dark)', borderRadius: 8, padding: '12px 16px', minHeight: 200, fontSize: '0.92rem', lineHeight: 1.7 }}>
        <EditorContent editor={editor} />
      </div>

      {/* Save indicator */}
      {saving && (
        <div style={{ marginTop: 8, fontSize: '0.78rem', color: 'var(--color-charcoal-light)' }}>
          {t('minutes.saving')}
        </div>
      )}

      {/* Publish button */}
      <div style={{ marginTop: 20 }}>
        {!publishConfirm ? (
          <button
            className="btn-primary"
            onClick={() => setPublishConfirm(true)}
            style={{ width: '100%', justifyContent: 'center' }}
          >
            {t('minutes.publish_btn')}
          </button>
        ) : (
          <div style={{ background: 'rgba(196,98,45,0.06)', border: '1.5px solid rgba(196,98,45,0.25)', borderRadius: 10, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--color-charcoal)', lineHeight: 1.5 }}>
              {t('minutes.publish_confirm')}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn-primary" style={{ flex: 1, justifyContent: 'center' }} onClick={handlePublish}>
                {t('minutes.publish_confirm_yes')}
              </button>
              <button className="btn-secondary" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setPublishConfirm(false)}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
