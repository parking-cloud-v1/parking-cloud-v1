'use client'

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'

type SignatureValue = {
  dataUrl: string
  strokeCount: number
  pointCount: number
  pathLength: number
  isValid: boolean
}

const EMPTY_VALUE: SignatureValue = {
  dataUrl: '',
  strokeCount: 0,
  pointCount: 0,
  pathLength: 0,
  isValid: false,
}

function signatureValid(
  strokeCount: number,
  pointCount: number,
  pathLength: number
) {
  return strokeCount >= 1 && pointCount >= 12 && pathLength >= 80
}

export default function HandwrittenSignaturePad({
  disabled = false,
  onChange,
}: {
  disabled?: boolean
  onChange: (value: SignatureValue) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawingRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)
  const metricsRef = useRef({
    strokeCount: 0,
    pointCount: 0,
    pathLength: 0,
  })
  const hasInkRef = useRef(false)
  const [hasInk, setHasInk] = useState(false)
  const [isValid, setIsValid] = useState(false)

  function setupCanvas(preserve = true) {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const cssWidth = Math.max(280, Math.floor(rect.width || 640))
    const cssHeight = 220
    const ratio = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2)

    let previous: HTMLCanvasElement | null = null
    if (preserve && canvas.width > 0 && canvas.height > 0 && hasInkRef.current) {
      previous = document.createElement('canvas')
      previous.width = canvas.width
      previous.height = canvas.height
      const pctx = previous.getContext('2d')
      if (pctx) pctx.drawImage(canvas, 0, 0)
    }

    canvas.width = Math.round(cssWidth * ratio)
    canvas.height = Math.round(cssHeight * ratio)
    canvas.style.height = `${cssHeight}px`

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, cssWidth, cssHeight)

    if (previous) {
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.drawImage(previous, 0, 0, canvas.width, canvas.height)
      ctx.restore()
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    }

    ctx.strokeStyle = '#111827'
    ctx.lineWidth = 2.6
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
  }

  useEffect(() => {
    setupCanvas(false)

    const resize = () => setupCanvas(true)
    window.addEventListener('resize', resize)

    return () => window.removeEventListener('resize', resize)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function pointFromEvent(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    }
  }

  function begin(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (disabled) return

    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    event.preventDefault()
    canvas.setPointerCapture?.(event.pointerId)

    const point = pointFromEvent(event)
    drawingRef.current = true
    lastPointRef.current = point
    metricsRef.current.strokeCount += 1
    metricsRef.current.pointCount += 1

    ctx.beginPath()
    ctx.moveTo(point.x, point.y)
  }

  function move(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (disabled || !drawingRef.current) return

    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    const last = lastPointRef.current
    if (!canvas || !ctx || !last) return

    event.preventDefault()
    const point = pointFromEvent(event)
    const distance = Math.hypot(point.x - last.x, point.y - last.y)

    if (distance < 0.7) return

    ctx.lineTo(point.x, point.y)
    ctx.stroke()

    metricsRef.current.pointCount += 1
    metricsRef.current.pathLength += distance
    lastPointRef.current = point
    hasInkRef.current = true
    setHasInk(true)
  }

  function end(event?: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return
    event?.preventDefault()

    drawingRef.current = false
    lastPointRef.current = null

    const canvas = canvasRef.current
    if (!canvas) return

    const metrics = metricsRef.current
    const valid = signatureValid(
      metrics.strokeCount,
      metrics.pointCount,
      metrics.pathLength
    )

    setIsValid(valid)
    onChange({
      dataUrl: hasInk || metrics.pathLength > 0 ? canvas.toDataURL('image/png') : '',
      strokeCount: metrics.strokeCount,
      pointCount: metrics.pointCount,
      pathLength: Math.round(metrics.pathLength * 10) / 10,
      isValid: valid,
    })
  }

  function clear() {
    if (disabled) return
    metricsRef.current = {
      strokeCount: 0,
      pointCount: 0,
      pathLength: 0,
    }
    drawingRef.current = false
    lastPointRef.current = null
    hasInkRef.current = false
    setHasInk(false)
    setIsValid(false)
    setupCanvas(false)
    onChange(EMPTY_VALUE)
  }

  return (
    <div>
      <div
        style={{
          border: `2px solid ${isValid ? '#86efac' : '#cbd5e1'}`,
          borderRadius: 14,
          overflow: 'hidden',
          background: '#fff',
          position: 'relative',
        }}
      >
        <canvas
          ref={canvasRef}
          onPointerDown={begin}
          onPointerMove={move}
          onPointerUp={end}
          onPointerCancel={end}
          onPointerLeave={(event) => {
            if (drawingRef.current && event.buttons === 0) end(event)
          }}
          style={{
            display: 'block',
            width: '100%',
            height: 220,
            touchAction: 'none',
            cursor: disabled ? 'not-allowed' : 'crosshair',
            background: '#fff',
          }}
          aria-label="承租人手寫簽名區"
        />

        {!hasInk && (
          <div
            style={{
              pointerEvents: 'none',
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#94a3b8',
              fontWeight: 800,
              fontSize: 15,
            }}
          >
            請在此使用手指、觸控筆或滑鼠簽名
          </div>
        )}

        <div
          style={{
            position: 'absolute',
            left: 24,
            right: 24,
            bottom: 34,
            borderBottom: '1px dashed #cbd5e1',
            pointerEvents: 'none',
          }}
        />
      </div>

      <div
        style={{
          marginTop: 9,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            color: isValid ? '#166534' : '#64748b',
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {isValid
            ? '✓ 手寫簽名完成'
            : hasInk
              ? '請再完整簽寫一些筆畫，避免只有一點或過短線條。'
              : '簽名完成後才能送出正式契約。'}
        </div>

        <button
          type="button"
          onClick={clear}
          disabled={disabled || !hasInk}
          style={{
            padding: '8px 14px',
            border: '1px solid #cbd5e1',
            borderRadius: 9,
            background: '#fff',
            color: '#334155',
            fontWeight: 800,
            cursor: disabled || !hasInk ? 'not-allowed' : 'pointer',
            opacity: disabled || !hasInk ? 0.5 : 1,
          }}
        >
          清除重簽
        </button>
      </div>
    </div>
  )
}
