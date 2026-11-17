import { forwardRef, useEffect, useMemo } from 'react'

import { asToyInstance } from './blocks'
import { handPhoneGeometry } from './handPhone'
import { sharedMaterials } from './materials'

/**
 * The phone in a character's right hand. The avatar moves this group onto its palm every
 * frame (its `handRef`); whoever owns it hides it while the phone is falling.
 */
export const HeldPhone = forwardRef(function HeldPhone({ phoneId }, ref) {
  const mesh = useMemo(() => asToyInstance(handPhoneGeometry(phoneId), sharedMaterials().toy), [phoneId])
  // The geometry is shared (cached); only the mesh is this hand's.
  useEffect(() => () => mesh.dispose(), [mesh])
  return (
    <group ref={ref}>
      <primitive object={mesh} />
    </group>
  )
})

export default HeldPhone
