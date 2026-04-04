import { Navigate } from 'react-router-dom'

/**
 * Registration is now handled inline on the home screen.
 * Deep-links (e.g. QR codes) redirect to home.
 */
export default function Register() {
  return <Navigate to="/" replace />
}
