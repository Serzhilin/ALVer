import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { MeetingProvider } from './context/MeetingContext'
import { UserProvider } from './context/UserContext'
import Home from './views/Home'
import Facilitate from './views/Facilitate'
import Attend from './views/Attend'
import Register from './views/Register'
import Display from './views/Display'
import Archive from './views/Archive'

export default function App() {
  return (
    <UserProvider>
    <MeetingProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/meeting/:id/facilitate" element={<Facilitate />} />
          <Route path="/meeting/:id/attend" element={<Attend />} />
          <Route path="/meeting/:id/register" element={<Register />} />
          <Route path="/meeting/:id/display" element={<Display />} />
          <Route path="/meeting/:id/archive" element={<Archive />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </MeetingProvider>
    </UserProvider>
  )
}
