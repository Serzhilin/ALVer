import { useState, useEffect } from 'react'
import QRCode from 'qrcode'
import { getAuthOffer, subscribeToAuthSession, pollAuthSessionResult } from '../api/client'
import { useTranslation } from 'react-i18next'
import { Loading, ErrorText, Input, Button } from '@ecommons/ui'
import styles from './LoginScreen.module.css'


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

    function finish(token) {
      if (done) return
      done = true
      if (unsub) unsub()
      onSuccess(token)
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
          unsub = subscribeToAuthSession(sid, ({ token }) => finish(token))

          // Polling fallback — SSE can silently fail in some browser/network setups
          const pollInterval = setInterval(async () => {
            if (done) { clearInterval(pollInterval); return }
            const result = await pollAuthSessionResult(sid).catch(() => null)
            if (result?.token) finish(result.token)
          }, 2000)
          const originalUnsub = unsub
          unsub = () => { originalUnsub(); clearInterval(pollInterval) }
        }
      })
      .catch(() => setStatus('error'))

    return () => {
      done = true
      if (unsub) unsub()
    }
  }, [])

  return (
    <div className={styles.container}>

      <div className={styles.inner}>

        {/* Instruction */}
        <p className={styles.instruction}>
          {isMobile ? (
            <>
              {t('auth.mobile_instruction_pre')}{' '}
              <a href="https://play.google.com/store/apps/details?id=foundation.metastate.eid_wallet" target="_blank" rel="noreferrer" className={styles.appLink}>
                {t('auth.eid_app_link')}
              </a>
              {' '}{t('auth.mobile_instruction_post')}
            </>
          ) : (
            <>
              {t('auth.desktop_instruction_pre')}{' '}
              <a href="https://play.google.com/store/apps/details?id=foundation.metastate.eid_wallet" target="_blank" rel="noreferrer" className={styles.appLink}>
                {t('auth.eid_app_link')}
              </a>
              {' '}{t('auth.desktop_instruction_post')}
            </>
          )}
        </p>

        {/* QR / deep link area */}
        {status === 'loading' && (
          <Loading style={{ width: 220, height: 220, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {t('auth.loading_qr')}
          </Loading>
        )}

        {status === 'error' && (
          <ErrorText as="p">{t('auth.offer_error')}</ErrorText>
        )}

        {status === 'waiting' && !isMobile && qrDataUrl && (
          <div className={styles.qrArea}>
            <div className={styles.qrBox}>
              <img src={qrDataUrl} alt="QR code" width={200} height={200} className={styles.qrImg} />
            </div>
          </div>
        )}

        {status === 'waiting' && isMobile && offer && (
          <a href={offer} className={styles.walletBtn}>
            {t('auth.open_wallet_btn')}
          </a>
        )}

        {/* Expiry note */}
        {status === 'waiting' && (
          <div className={styles.expiryNote}>
            <p className={styles.expiryTitle}>{t('auth.code_validity')}</p>
            <p className={styles.expiryHint}>{t('auth.code_expired_hint')}</p>
          </div>
        )}

        {/* W3DS info */}
        <div className={styles.infoBox}>
          {t('auth.w3ds_info')}
        </div>

        {import.meta.env.DEV && offer && (
          <p className={styles.devOffer}>{offer}</p>
        )}

      </div>

      {/* Name fallback */}
      {nameOption && onNameContinue && (
        <>
          <div className={styles.divider}>
            <div className={styles.dividerLine} />
            <span className={styles.dividerLabel}>{t('auth.or_name')}</span>
            <div className={styles.dividerLine} />
          </div>
          <div className={styles.nameSection}>
            <Input
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              placeholder={t('common.name_placeholder')}
              onKeyDown={e => e.key === 'Enter' && nameInput.trim() && onNameContinue(nameInput.trim())}
            />
            <div className={styles.fullWidthBtn}>
              <Button
                variant="secondary"
                disabled={!nameInput.trim()}
                onClick={() => onNameContinue(nameInput.trim())}
              >
                {t('auth.continue_as_guest')}
              </Button>
            </div>
          </div>
        </>
      )}


      {/* Footer: Project of eCommons + Metastate */}
      <div className={styles.footer}>
        <span className={styles.footerLabel}>Project of</span>
        <a href="https://ecommons.space" target="_blank" rel="noopener noreferrer">
          <img src="/eCommons.svg" alt="eCommons" className={styles.footerLogoEcommons} />
        </a>
        <span className={styles.footerAnd}>and</span>
        <a href="https://metastate.foundation" target="_blank" rel="noopener noreferrer">
          <img src="/metastate.png" alt="Metastate" className={styles.footerLogoMetastate} />
        </a>
      </div>

    </div>
  )
}
