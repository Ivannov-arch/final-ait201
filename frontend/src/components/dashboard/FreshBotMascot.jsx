export default function FreshBotMascot({ className = '' }) {
  return (
    <img
      src="/image/main/char2.png"
      alt="FreshGuard AI Assistant Mascot"
      className={className}
      loading="lazy"
      onError={(e) => {
        // Fallback to high-resolution friendly avatar placeholder image if local file fails
        e.currentTarget.src = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=240&auto=format&fit=crop&q=80'
      }}
    />
  )
}
