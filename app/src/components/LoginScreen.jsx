import { useState, useEffect } from 'react'
import QRCode from 'qrcode'
import { getAuthOffer, subscribeToAuthSession } from '../api/client'
import { useTranslation } from 'react-i18next'


const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)

/**
 * LoginScreen — shows the eID auth flow.
 *
 * Props:
 *   onSuccess(token, user) — called when auth completes
 *   nameOption             — if true, shows "continue with name" fallback below
 *   onNameContinue(name)   — called when user chooses name fallback
 */
export default function LoginScreen({ onSuccess, nameOption = false, onNameContinue, returnTo }) {
  const { t } = useTranslation()
  const [offer, setOffer] = useState(null)
  const [qrDataUrl, setQrDataUrl] = useState(null)
  const [status, setStatus] = useState('loading') // loading | waiting | error
  const [nameInput, setNameInput] = useState('')

  useEffect(() => {
    let unsub = null
    let sessionId = null
    let done = false

    function finish(token, user) {
      if (done) return
      done = true
      if (unsub) unsub()
      onSuccess(token, user)
    }

    getAuthOffer(returnTo)
      .then(async ({ offer: offerUrl, sessionId: sid }) => {
        sessionId = sid
        setOffer(offerUrl)
        setStatus('waiting')

        if (isMobile) {
          // On mobile the wallet opens a new tab (/deeplink-login) which handles the token.
          // Nothing to do here — Tab 1 just keeps the offer visible.
        } else {
          const dataUrl = await QRCode.toDataURL(offerUrl, { width: 220, margin: 2 })
          setQrDataUrl(dataUrl)
          unsub = subscribeToAuthSession(sid, ({ token, user }) => finish(token, user))
        }
      })
      .catch(() => setStatus('error'))

    return () => {
      done = true
      if (unsub) unsub()
    }
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, width: '100%' }}>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, color: 'var(--color-charcoal-light)', textAlign: 'center', width: '100%' }}>

        {/* Instruction */}
        <p style={{ margin: 0, fontSize: '1rem', lineHeight: 1.5 }}>
          {isMobile ? (
            <>
              {t('auth.mobile_instruction_pre')}{' '}
              <a href="https://play.google.com/store/apps/details?id=foundation.metastate.eid_wallet" target="_blank" rel="noreferrer" style={{ fontWeight: 700, color: 'var(--color-charcoal)', textDecoration: 'underline' }}>
                {t('auth.eid_app_link')}
              </a>
              {' '}{t('auth.mobile_instruction_post')}
            </>
          ) : (
            <>
              {t('auth.desktop_instruction_pre')}{' '}
              <a href="https://play.google.com/store/apps/details?id=foundation.metastate.eid_wallet" target="_blank" rel="noreferrer" style={{ fontWeight: 700, color: 'var(--color-charcoal)', textDecoration: 'underline' }}>
                {t('auth.eid_app_link')}
              </a>
              {' '}{t('auth.desktop_instruction_post')}
            </>
          )}
        </p>

        {/* QR / deep link area */}
        {status === 'loading' && (
          <div style={{ width: 220, height: 220, background: 'var(--color-sand)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: 'var(--color-charcoal-light)', fontSize: '0.85rem' }}>{t('auth.loading_qr')}</span>
          </div>
        )}

        {status === 'error' && (
          <p style={{ color: 'var(--color-red)', fontSize: '0.9rem' }}>
            {t('auth.offer_error')}
          </p>
        )}

        {status === 'waiting' && !isMobile && qrDataUrl && (
          <div style={{ padding: 12, background: 'white', borderRadius: 10, border: '1px solid var(--color-sand)', display: 'inline-block' }}>
            <img src={qrDataUrl} alt="QR code" width={200} height={200} style={{ display: 'block' }} />
          </div>
        )}

        {status === 'waiting' && isMobile && offer && (
          <a
            href={offer}
            style={{
              display: 'inline-flex', justifyContent: 'center', padding: '12px 28px',
              background: '#2563EB', color: 'white', borderRadius: 8, fontWeight: 600,
              fontSize: '1rem', textDecoration: 'none', width: '100%', boxSizing: 'border-box',
            }}
          >
            {t('auth.open_wallet_btn')}
          </a>
        )}

        {/* Expiry note */}
        {status === 'waiting' && (
          <div style={{ fontSize: '0.85rem' }}>
            <p style={{ margin: '0 0 2px', fontWeight: 700, color: 'var(--color-charcoal)' }}>
              {t('auth.code_validity')}
            </p>
            <p style={{ margin: 0 }}>{t('auth.code_expired_hint')}</p>
          </div>
        )}

        {/* W3DS info box */}
        <div style={{ background: 'rgba(0,0,0,0.04)', borderRadius: 8, padding: '12px 16px', fontSize: '0.82rem', lineHeight: 1.6, textAlign: 'left', color: 'var(--color-charcoal-light)' }}>
          {t('auth.w3ds_info')}
        </div>

      </div>

      {/* Name fallback */}
      {nameOption && onNameContinue && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--color-sand)' }} />
            <span style={{ fontSize: '0.78rem', color: 'var(--color-charcoal-light)', whiteSpace: 'nowrap' }}>
              {t('auth.or_name')}
            </span>
            <div style={{ flex: 1, height: 1, background: 'var(--color-sand)' }} />
          </div>
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input
              className="input"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              placeholder={t('common.name_placeholder')}
              onKeyDown={e => e.key === 'Enter' && nameInput.trim() && onNameContinue(nameInput.trim())}
            />
            <button
              className="btn-secondary"
              style={{ width: '100%', justifyContent: 'center', fontSize: '0.88rem' }}
              disabled={!nameInput.trim()}
              onClick={() => onNameContinue(nameInput.trim())}
            >
              {t('auth.continue_as_guest')}
            </button>
          </div>
        </>
      )}

      {/* Footer: Project of eCommons + Metastate */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, width: '100%', paddingTop: 4 }}>
        <span style={{ fontSize: '0.78rem', color: 'var(--color-charcoal-light)', whiteSpace: 'nowrap' }}>Project of</span>
        <a href="https://ecommons.space" target="_blank" rel="noopener noreferrer">
          <img src="/eCommons.svg" alt="eCommons" style={{ height: 28, opacity: 0.75 }} />
        </a>
        <span style={{ fontSize: '0.78rem', color: 'var(--color-charcoal-light)' }}>and</span>
        <a href="https://metastate.foundation" target="_blank" rel="noopener noreferrer">
          <img src="/metastate.png" alt="Metastate" style={{ height: 28, opacity: 0.85 }} />
        </a>
      </div>

    </div>
  )
}
