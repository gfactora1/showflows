'use client'

export default function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      style={{
        position: 'fixed',
        top: 20,
        right: 20,
        padding: '10px 20px',
        background: '#111',
        color: 'white',
        border: 'none',
        borderRadius: 8,
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      🖨️ Print
    </button>
  )
}
