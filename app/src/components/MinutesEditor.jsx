import { useState, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useTranslation } from 'react-i18next'
import { Button, Card } from '@ecommons/ui'
import { saveMinutes, publishMinutes } from '../api/client'
import styles from './MinutesEditor.module.css'

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
    <Card className={styles.editorCard}>
      {/* Import from Word — label triggers hidden file input (no ecommons-ui file picker) */}
      <div className={styles.importRow}>
        <label htmlFor="docx-import" className={styles.importLabel}>
          📄 {t('minutes.import_word')}
        </label>
        <input
          id="docx-import"
          type="file"
          accept=".docx"
          className={styles.docxInput}
          onChange={handleImportDocx}
        />
      </div>

      {/* TipTap editor */}
      <div className={styles.editorArea}>
        <EditorContent editor={editor} />
      </div>

      {/* Save indicator */}
      {saving && (
        <div className={styles.savingText}>
          {t('minutes.saving')}
        </div>
      )}

      {/* Publish button */}
      <div className={styles.publishArea}>
        {!publishConfirm ? (
          <Button
            variant="primary"
            className={styles.fullWidthBtn}
            onClick={() => setPublishConfirm(true)}
          >
            {t('minutes.publish_btn')}
          </Button>
        ) : (
          <div className={styles.publishConfirm}>
            <p className={styles.publishConfirmText}>
              {t('minutes.publish_confirm')}
            </p>
            <div className={styles.publishConfirmBtns}>
              <Button variant="primary" className={styles.flex1Btn} onClick={handlePublish}>
                {t('minutes.publish_confirm_yes')}
              </Button>
              <Button variant="secondary" className={styles.flex1Btn} onClick={() => setPublishConfirm(false)}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        )}
      </div>
    </Card>
  )
}
