import { useState, useEffect } from 'react'
import QRCode from 'qrcode'
import { getAuthOffer, subscribeToAuthSession } from '../api/client'
import { useTranslation } from 'react-i18next'
import { LanguageSwitcher } from './LanguageSwitcher'

const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)

/**
 * LoginScreen — shows the eID auth flow.
 *
 * Props:
 *   onSuccess(token, user) — called when auth completes
 *   nameOption             — if true, shows "continue with name" fallback below
 *   onNameContinue(name)   — called when user chooses name fallback
 */
export default function LoginScreen({ onSuccess, nameOption = false, onNameContinue }) {
  const { t } = useTranslation()
  const [offer, setOffer] = useState(null)      // w3ds:// deep link string
  const [qrDataUrl, setQrDataUrl] = useState(null)
  const [status, setStatus] = useState('loading') // loading | waiting | error
  const [nameInput, setNameInput] = useState('')

  useEffect(() => {
    let unsub = null
    getAuthOffer()
      .then(async ({ offer: offerUrl, sessionId }) => {
        setOffer(offerUrl)
        setStatus('waiting')

        // Generate QR for desktop
        if (!isMobile) {
          const dataUrl = await QRCode.toDataURL(offerUrl, { width: 220, margin: 2 })
          setQrDataUrl(dataUrl)
        }

        // Subscribe to SSE — fires when wallet approves on any device
        unsub = subscribeToAuthSession(sessionId, ({ token, user }) => {
          onSuccess(token, user)
        })
      })
      .catch(() => setStatus('error'))

    return () => { if (unsub) unsub() }
  }, [])

  return (
    <div style={{ maxWidth: 400, width: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ margin: 0, fontSize: '1.1rem' }}>
          {t('auth.login_title', 'Inloggen met eID')}
        </h2>
        <LanguageSwitcher />
      </div>

      {status === 'loading' && (
        <p style={{ color: 'var(--color-charcoal-light)', fontSize: '0.9rem', textAlign: 'center', padding: '32px 0' }}>
          {t('common.loading')}
        </p>
      )}

      {status === 'error' && (
        <p style={{ color: 'var(--color-red)', fontSize: '0.9rem', textAlign: 'center', padding: '32px 0' }}>
          {t('auth.offer_error', 'Kon geen inloglink ophalen. Probeer opnieuw.')}
        </p>
      )}

      {status === 'waiting' && (
        <>
          {!isMobile && qrDataUrl && (
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <p style={{ color: 'var(--color-charcoal-light)', fontSize: '0.85rem', margin: '0 0 16px' }}>
                {t('auth.scan_qr', 'Scan met de eID-app op je telefoon')}
              </p>
              <div style={{ display: 'inline-block', padding: 12, background: 'white', borderRadius: 10, border: '1px solid var(--color-sand)' }}>
                <img src={qrDataUrl} alt="QR code" width={220} height={220} style={{ display: 'block' }} />
              </div>
              <p style={{ color: 'var(--color-charcoal-light)', fontSize: '0.78rem', marginTop: 10 }}>
                <span className="animate-pulse-soft" style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--color-terracotta)', marginRight: 6, verticalAlign: 'middle' }} />
                {t('auth.waiting', 'Wachten op goedkeuring...')}
              </p>
            </div>
          )}

          {isMobile && offer && (
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <p style={{ color: 'var(--color-charcoal-light)', fontSize: '0.85rem', margin: '0 0 16px' }}>
                {t('auth.open_wallet', 'Open de eID-app om in te loggen')}
              </p>
              <a
                href={offer}
                className="btn-primary"
                style={{ display: 'inline-flex', justifyContent: 'center', textDecoration: 'none', width: '100%', boxSizing: 'border-box' }}
              >
                {t('auth.open_wallet_btn', 'Openen in eID-app')}
              </a>
              <p style={{ color: 'var(--color-charcoal-light)', fontSize: '0.78rem', marginTop: 12 }}>
                <span className="animate-pulse-soft" style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'var(--color-terracotta)', marginRight: 6, verticalAlign: 'middle' }} />
                {t('auth.waiting', 'Wachten op goedkeuring...')}
              </p>
            </div>
          )}
        </>
      )}

      {/* Name fallback */}
      {nameOption && onNameContinue && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0 16px' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--color-sand)' }} />
            <span style={{ fontSize: '0.78rem', color: 'var(--color-charcoal-light)', whiteSpace: 'nowrap' }}>
              {t('auth.or_name', 'of ga verder met naam')}
            </span>
            <div style={{ flex: 1, height: 1, background: 'var(--color-sand)' }} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <input
              className="input"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              placeholder={t('common.name_placeholder')}
              onKeyDown={e => e.key === 'Enter' && nameInput.trim() && onNameContinue(nameInput.trim())}
            />
          </div>
          <button
            className="btn-secondary"
            style={{ width: '100%', justifyContent: 'center', fontSize: '0.88rem' }}
            disabled={!nameInput.trim()}
            onClick={() => onNameContinue(nameInput.trim())}
          >
            {t('auth.continue_as_guest', 'Ga verder zonder eID')}
          </button>
        </>
      )}
    </div>
  )
}
