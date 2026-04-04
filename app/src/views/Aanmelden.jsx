import { Navigate } from 'react-router-dom'

/**
 * Fixed public URL: /aanmelden
 * All registration is now handled inline on the home screen.
 */
export default function Aanmelden() {
  return <Navigate to="/" replace />
}
