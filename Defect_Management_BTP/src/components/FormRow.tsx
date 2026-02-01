// src/components/FormRow.tsx
import React, { memo } from 'react'

type Props = {
  label: string
  children: React.ReactNode
  labelWidth?: string
  ml?: string
  alignY?: 'start' | 'center' | 'end'
  dense?: boolean
  contentStyle?: React.CSSProperties
  labelStyle?: React.CSSProperties
}

const alignMap = { start: 'flex-start', center: 'center', end: 'flex-end' } as const

const FormRow: React.FC<Props> = memo(({ label, children, labelWidth = '7vw', ml = '0', alignY = 'center', dense = false, contentStyle, labelStyle }) => (
  <div
    style={{
      display: 'grid',
      gridTemplateColumns: `${labelWidth} 1fr`,
      alignItems: alignMap[alignY],
      columnGap: 0,
      padding: dense ? 0 : '0.5vh 0',
      marginLeft: ml,
    }}
  >
    <span style={{ ...labelStyle }} tabIndex={-1}>
      {label}
    </span>
    <div style={contentStyle}>{children}</div>
  </div>
))
FormRow.displayName = 'FormRow'

export default FormRow
