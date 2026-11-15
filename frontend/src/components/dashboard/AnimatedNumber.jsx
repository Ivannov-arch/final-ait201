import { useRef, useEffect } from 'react'
import gsap from 'gsap'

export default function AnimatedNumber({ value, prefix = '', suffix = '', decimals = 0 }) {
  const nodeRef = useRef(null)
  const prevValRef = useRef(0)

  useEffect(() => {
    const num = Number(value || 0)
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      if (nodeRef.current) {
        nodeRef.current.textContent = `${prefix}${num.toLocaleString('en-MY', {
          minimumFractionDigits: decimals,
          maximumFractionDigits: decimals
        })}${suffix}`
      }
      return
    }

    const obj = { val: prevValRef.current }
    const tween = gsap.to(obj, {
      val: num,
      duration: 1.1,
      ease: 'power3.out',
      onUpdate: () => {
        if (nodeRef.current) {
          nodeRef.current.textContent = `${prefix}${obj.val.toLocaleString('en-MY', {
            minimumFractionDigits: decimals,
            maximumFractionDigits: decimals
          })}${suffix}`
        }
      }
    })
    prevValRef.current = num

    return () => tween.kill()
  }, [value, prefix, suffix, decimals])

  return (
    <span ref={nodeRef}>
      {prefix}
      {Number(value || 0).toLocaleString('en-MY', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
      })}
      {suffix}
    </span>
  )
}
