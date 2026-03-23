import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'

function ToolbarBtn({ onClick, active, title, children }) {
  return (
    <button
      type="button"
      onMouseDown={e => { e.preventDefault(); onClick() }}
      title={title}
      style={{
        background: active ? 'var(--color-terracotta)' : 'transparent',
        color: active ? 'white' : 'var(--color-charcoal)',
        border: 'none', borderRadius: 5, padding: '3px 7px',
        cursor: 'pointer', fontSize: '0.82rem', fontWeight: 600,
        lineHeight: 1.4, transition: 'background 0.1s',
      }}
    >
      {children}
    </button>
  )
}

function Toolbar({ editor, extraRight }) {
  if (!editor) return null
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '6px 8px', borderBottom: '1px solid var(--color-sand)',
      background: 'var(--color-cream)', flexWrap: 'wrap', gap: 2,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Bold"><b>B</b></ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italic"><i>I</i></ToolbarBtn>
        <div style={{ width: 1, height: 18, background: 'var(--color-sand-dark)', margin: '0 4px' }} />
        <ToolbarBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Bullet list">≡</ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Numbered list">1.</ToolbarBtn>
        <div style={{ width: 1, height: 18, background: 'var(--color-sand-dark)', margin: '0 4px' }} />
        <ToolbarBtn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="Quote">"</ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} active={false} title="Divider">—</ToolbarBtn>
      </div>
      {extraRight}
    </div>
  )
}

export default function RichTextEditor({ value, onChange }) {
  const [fullscreen, setFullscreen] = useState(false)

  const editor = useEditor({
    extensions: [StarterKit],
    content: value || '',
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  })

  // close on Escape
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') setFullscreen(false) }
    if (fullscreen) document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [fullscreen])

  const expandBtn = (
    <button
      type="button"
      onMouseDown={e => { e.preventDefault(); setFullscreen(v => !v) }}
      title={fullscreen ? 'Exit fullscreen' : 'Expand editor'}
      style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.9rem', color: 'var(--color-charcoal-light)', padding: '2px 6px', marginLeft: 4 }}
    >
      {fullscreen ? '⊡' : '⊞'}
    </button>
  )

  const inlineEditor = (
    <div style={{ border: '1.5px solid var(--color-sand-dark)', borderRadius: 8, overflow: 'hidden', background: 'white' }}>
      <Toolbar editor={editor} extraRight={expandBtn} />
      <EditorContent
        editor={editor}
        style={{ minHeight: 160, padding: '10px 14px', fontSize: '0.88rem', lineHeight: 1.7, cursor: 'text' }}
      />
    </div>
  )

  if (!fullscreen) return inlineEditor

  return (
    <>
      {inlineEditor}
      {createPortal(
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(44,44,44,0.5)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', padding: 24,
          }}
          onMouseDown={() => setFullscreen(false)}
        >
          <div
            style={{ width: '100%', maxWidth: 860, height: '80vh', display: 'flex', flexDirection: 'column', background: 'white', borderRadius: 12, overflow: 'hidden', boxShadow: '0 8px 40px rgba(0,0,0,0.2)' }}
            onMouseDown={e => e.stopPropagation()}
          >
            <Toolbar editor={editor} extraRight={expandBtn} />
            <EditorContent
              editor={editor}
              style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', fontSize: '0.95rem', lineHeight: 1.8, cursor: 'text' }}
            />
          </div>
        </div>,
        document.body
      )}
    </>
  )
}
