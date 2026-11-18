import { forwardRef, useEffect, useMemo } from 'react'

import { asToyInstance } from '../blocks'
import { sharedMaterials } from '../materials'
import { buildToolGeometry } from '../toolModels'

/**
 * The screwdriver your avatar carries round the lobby, in your skin's colours. The avatar
 * moves the forwarded group to its hand each frame (PlayerAvatar's `handRef`).
 */
export const HeldTool = forwardRef(function HeldTool({ skin = 'classic', tool = 'driver' }, ref) {
  const parts = useMemo(() => {
    const { body, bit } = buildToolGeometry(tool, skin)
    return [asToyInstance(body, sharedMaterials().toy), asToyInstance(bit, sharedMaterials().toy)]
  }, [skin, tool])

  useEffect(
    () => () => {
      for (const m of parts) {
        m.geometry.dispose()
        m.dispose()
      }
    },
    [parts],
  )

  return (
    <group ref={ref}>
      {/* Gripped in the fist, pointing forward and a little down. */}
      <group rotation={[0.3, Math.PI, 0]} position={[0, -0.02, 0.02]} scale={1.6}>
        {parts.map((m, i) => (
          <primitive key={i} object={m} />
        ))}
      </group>
    </group>
  )
})

export default HeldTool
