export default function DarkModeToggle({ isDark, toggle }) {
  return (
    <button
      onClick={toggle}
      className="p-2 rounded-lg bg-blue-700 hover:bg-blue-800 transition"
      title={isDark ? 'وضع فاتح' : 'وضع داكن'}
    >
      {isDark ? '☀️' : '🌙'}
    </button>
  )
}
