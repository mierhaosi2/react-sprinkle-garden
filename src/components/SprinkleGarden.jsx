import { useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import './SprinkleGarden.css'

// 植物 ASCII 行（从顶部花朵 → 底部地面）
const PLANT_LINES = ['(@)', '-.', '\\Y/', '\\ |', ',-', '\\|/', '^^^']

// 各生长阶段显示的行（从地面开始往上生长）
// stage N 显示最后 N 行（即底部 N 行）
const PLANT_STAGES = Array.from({ length: PLANT_LINES.length + 1 }, (_, stage) =>
  stage === 0 ? [] : PLANT_LINES.slice(PLANT_LINES.length - stage)
)

const MAX_STAGE = PLANT_LINES.length

// 水滴 ASCII 字符集
const DROP_CHARS = ['.', '~', ':', "'", ',']

let uid = 0

// 单个 ASCII 水滴粒子
const AsciiDrop = ({ x, y, char, vx, vy, onComplete }) => (
  <motion.span
    className="ascii-drop"
    style={{ left: x, top: y }}
    initial={{ x: 0, y: 0, opacity: 1 }}
    animate={{
      x: vx,
      y: [0, vy * 0.35, vy],
      opacity: [1, 0.85, 0],
    }}
    transition={{
      duration: 0.55 + Math.random() * 0.35,
      ease: 'easeIn',
      y: { times: [0, 0.38, 1], ease: ['easeOut', 'easeIn'] },
    }}
    onAnimationComplete={onComplete}
  >
    {char}
  </motion.span>
)

// 单株植物组件
const AsciiPlant = ({ plant, onWater }) => {
  const lines = PLANT_STAGES[plant.stage] ?? []
  const isFullyGrown = plant.stage >= MAX_STAGE

  return (
    <motion.div
      className={`ascii-plant ${isFullyGrown ? 'fully-grown' : ''}`}
      onClick={onWater}
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.94 }}
      transition={{ type: 'spring', stiffness: 400, damping: 22 }}
    >
      {/* 植物文字区域（固定高度，植物从底部向上"生长"） */}
      <div className="plant-text-area">
        {/* 空白占位，让植物贴底对齐 */}
        <div className="plant-lines">
          <AnimatePresence initial={false}>
            {lines.map((line) => {
              // lineIndex 是该行在 PLANT_LINES 里的固定位置
              const lineIndex = PLANT_LINES.indexOf(line)
              const isNewest = lineIndex === PLANT_LINES.length - plant.stage
              return (
                <motion.div
                  key={lineIndex}
                  className="plant-line"
                  initial={isNewest ? { opacity: 0, x: -6 } : false}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.22 }}
                >
                  {line}
                </motion.div>
              )
            })}
          </AnimatePresence>

          {/* 未种植时显示种子 */}
          {plant.stage === 0 && (
            <motion.div
              className="plant-line seed"
              animate={{ opacity: [0.4, 0.9, 0.4] }}
              transition={{ duration: 2, repeat: Infinity }}
            >
              ..
            </motion.div>
          )}
        </div>
      </div>

      {/* 水量进度条（ASCII 风格） */}
      <div className="plant-progress">
        {'['}
        {Array.from({ length: MAX_STAGE }).map((_, i) => (
          <span key={i} className={i < plant.stage ? 'filled' : 'empty'}>
            {i < plant.stage ? '█' : '░'}
          </span>
        ))}
        {']'}
      </div>
    </motion.div>
  )
}

// 主花园组件
export const SprinkleGarden = () => {
  const [plants, setPlants] = useState(() =>
    Array.from({ length: 6 }, (_, i) => ({ id: i, stage: 0 }))
  )
  const [drops, setDrops] = useState([])
  const gardenRef = useRef(null)
  const throttleRef = useRef(false)

  // 生成水滴粒子
  const spawnDrops = useCallback((originX, originY, count = 10) => {
    const newDrops = Array.from({ length: count }, () => {
      const angle = (-Math.PI * 5 / 6) + Math.random() * (Math.PI * 2 / 3)
      const speed = 40 + Math.random() * 90
      return {
        id: uid++,
        x: originX,
        y: originY,
        char: DROP_CHARS[Math.floor(Math.random() * DROP_CHARS.length)],
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed + 60,
      }
    })
    setDrops(prev => [...prev, ...newDrops])
  }, [])

  // 鼠标移动时在天空区域洒水
  const handleMouseMove = useCallback((e) => {
    if (throttleRef.current) return
    throttleRef.current = true
    setTimeout(() => { throttleRef.current = false }, 70)

    const rect = gardenRef.current?.getBoundingClientRect()
    if (!rect) return
    const relY = e.clientY - rect.top
    if (relY > rect.height * 0.6) return

    spawnDrops(e.clientX, e.clientY, 3)
  }, [spawnDrops])

  // 点击植物浇水
  const handleWater = useCallback((plantId, e) => {
    e.stopPropagation()
    const rect = e.currentTarget.getBoundingClientRect()
    spawnDrops(rect.left + rect.width / 2, rect.top + rect.height * 0.3, 16)

    setPlants(prev =>
      prev.map(p =>
        p.id === plantId
          ? { ...p, stage: Math.min(p.stage + 1, MAX_STAGE) }
          : p
      )
    )
  }, [spawnDrops])

  const removeDrop = useCallback((id) => {
    setDrops(prev => prev.filter(d => d.id !== id))
  }, [])

  const totalStages = plants.reduce((sum, p) => sum + p.stage, 0)
  const allGrown = plants.every(p => p.stage >= MAX_STAGE)

  return (
    <div
      ref={gardenRef}
      className="sprinkle-garden"
      onMouseMove={handleMouseMove}
    >
      {/* 顶部标题栏 */}
      <div className="garden-header">
        <span className="header-tag">// sprinkle-garden.jsx</span>
        <span className="header-status">
          {allGrown ? '🌸 garden fully bloomed' : `watered: ${totalStages}/${plants.length * MAX_STAGE}`}
        </span>
      </div>

      {/* 天空/内容区 */}
      <div className="garden-sky">
        <motion.div
          className="sky-text"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 1 }}
        >
          <p className="sky-line comment">{'/* hover to sprinkle  */'}</p>
          <p className="sky-line comment">{'/* click to water      */'}</p>
          <p className="sky-line"></p>
          <p className="sky-line quote">
            {allGrown
              ? '"to plant a garden, is to believe in the future."'
              : '"to plant a garden, is to believe in the future."'}
          </p>
        </motion.div>

        {/* 云朵 ASCII */}
        <div className="ascii-clouds">
          <motion.span
            className="ascii-cloud"
            animate={{ x: [0, 18, 0] }}
            transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
          >
            {' ( ( ( ) ) ) '}
          </motion.span>
          <motion.span
            className="ascii-cloud cloud-2"
            animate={{ x: [0, -14, 0] }}
            transition={{ duration: 12, repeat: Infinity, ease: 'easeInOut' }}
          >
            {'  ( ( ) )  '}
          </motion.span>
        </div>
      </div>

      {/* 植物行 */}
      <div className="plants-row">
        {plants.map(plant => (
          <AsciiPlant
            key={plant.id}
            plant={plant}
            onWater={(e) => handleWater(plant.id, e)}
          />
        ))}
      </div>

      {/* 地面 ASCII 草地 */}
      <div className="garden-floor">
        <div className="floor-grass">
          {'~^~^~^^~^~~^~~^^~^~^~^^~^~~^~~^^~^~^~^^~^~~^~~^^~^~^~^^~^~~^~~^^~^~'}
        </div>
        <div className="floor-soil">
          {'░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░'}
        </div>
      </div>

      {/* 底部引言 */}
      <div className="garden-footer">
        <span>xxx</span>
      </div>

      {/* 全局水滴粒子层 */}
      <AnimatePresence>
        {drops.map(d => (
          <AsciiDrop
            key={d.id}
            x={d.x}
            y={d.y}
            char={d.char}
            vx={d.vx}
            vy={d.vy}
            onComplete={() => removeDrop(d.id)}
          />
        ))}
      </AnimatePresence>
    </div>
  )
}
