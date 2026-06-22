import { useState, useCallback, useRef, useEffect, memo } from 'react'
import { motion, AnimatePresence, useMotionValue } from 'framer-motion'
import cursorImg from '../assets/cursor.png'
import './GardenCanvas.css'

// ─── 植物数据 ───────────────────────────────────────────────
const GROUND = '^^^'

// 花朵头部形态（每组从上到下，第一行是最后长出来的花瓣，最后一行是花萼）
// 单行：花朵一次性盛开  多行：先长出花萼再盛开花瓣（bloom动画）
const FLOWER_HEADS = [
  ['(@)'],              // 经典圆花
  ['(*)'],              // 星形花
  ['{@}'],              // 卷花
  ['~@~'],              // 波浪花
  [';@;'],              // 触角花
  ['-*-'],              // 简约星
  ['vVVVv', '(___)'],   // 郁金香：(___)花萼先出，vVVVv花瓣绽放
  [',,,',   '{_}' ],    // 丛生花：{_}底托先出，,,,叶冠绽放
  ['oOo',   '(__)'],    // 宽花冠：(__)底先出，oOo绽放
  ['*o*',   '(==)'],    // 宝石花
]

// 茎叶中间节点池（含双侧叶片变体）
const MID_POOL = [
  '-.',
  '\\Y/',
  '\\ |',       // 左叶
  '\\ | /',     // 双叶
  '\\  | /',    // 宽双叶
  ',-',
  '\\|/',
  ' | /',       // 右叶
]


// 根据模板生成各生长阶段（从地面往上逐行解锁）
const makeStages = (template) =>
  Array.from({ length: template.length + 1 }, (_, stage) =>
    stage === 0 ? [] : template.slice(template.length - stage)
  )

const PLANT_COLORS = [
  'rgb(253, 107, 148)', // 粉色（原版）
  '#ff7c43',           // 橙红
  '#ffd93d',           // 黄色
  '#6bcb77',           // 绿色
  '#4ecdc4',           // 青色
  '#c084fc',           // 紫色
  '#ff9a3c',           // 琥珀
  '#f06292',           // 玫红
]


const DROP_CHARS = ['.', '~', ':', "'", ',']

let uid = 0

// ─── 随机散布植物（防重叠） ──────────────────────────────────
const generatePlants = (count) => {
  const plants = []
  const MIN_DIST = 7

  let attempts = 0
  while (plants.length < count && attempts < count * 30) {
    attempts++
    const x = Math.random() * 88 + 4   // 4%~92% 水平
    const y = Math.random() * 55 + 3   // 3%~58% 距底部（植物从这里往上长）

    const tooClose = plants.some((p) => {
      const dx = p.x - x
      const dy = (p.y - y) * 1.5
      return Math.sqrt(dx * dx + dy * dy) < MIN_DIST
    })

    if (!tooClose) {
      const head = FLOWER_HEADS[Math.floor(Math.random() * FLOWER_HEADS.length)]
      const midCount = Math.floor(Math.random() * 3) + 1
      const mids = [...MID_POOL].sort(() => Math.random() - 0.5).slice(0, midCount)
      const template = [...head, ...mids, GROUND]
      const maxStage = template.length
      plants.push({
        id: plants.length,
        x,
        y,
        template,
        flowerHeadLen: head.length,  // 花朵占几行（用于颜色 & bloom 动画判断）
        maxStage,
        stages: makeStages(template),
        stage: Math.floor(Math.random() ** 0.6 * (maxStage + 1)),
        color: PLANT_COLORS[Math.floor(Math.random() * PLANT_COLORS.length)],
      })
    }
  }
  return plants
}

// ─── 水滴粒子 ───────────────────────────────────────────────
const AsciiDrop = ({ x, y, char, vx, vy, color, onComplete }) => (
  <motion.span
    className="canvas-drop"
    style={{ left: x, top: y, color }}
    initial={{ x: 0, y: 0, opacity: 1 }}
    animate={{
      x: vx,
      y: [0, vy * 0.35, vy],
      opacity: [1, 0.85, 0],
    }}
    transition={{
      duration: 0.65,
      ease: 'easeIn',
      y: { times: [0, 0.38, 1], ease: ['easeOut', 'easeIn'] },
    }}
    onAnimationComplete={onComplete}
  >
    {char}
  </motion.span>
)

// ─── 水壶图片 Cursor ────────────────────────────────────────
const WateringCanCursor = ({ canvasRef, isPouring }) => {
  const mx = useMotionValue(-999)
  const my = useMotionValue(-999)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    // 偏移让水壶喷嘴尖端对准鼠标
    const onMove = (e) => { mx.set(e.clientX - 10); my.set(e.clientY - 30) }
    const onEnter = () => setVisible(true)
    const onLeave = () => { setVisible(false); mx.set(-999); my.set(-999) }
    el.addEventListener('mousemove', onMove)
    el.addEventListener('mouseenter', onEnter)
    el.addEventListener('mouseleave', onLeave)
    return () => {
      el.removeEventListener('mousemove', onMove)
      el.removeEventListener('mouseenter', onEnter)
      el.removeEventListener('mouseleave', onLeave)
    }
  }, [canvasRef, mx, my])

  if (!visible) return null
  return (
    <motion.img
      src={cursorImg}
      className="watering-can-cursor"
      style={{ left: mx, top: my }}
      // 静止时轻微前倾，浇水时大幅倾斜倒水
      animate={{ rotate: isPouring ? -20 : 10 }}
      transition={{ type: 'spring', stiffness: 220, damping: 16 }}
    />
  )
}

// 颜色：花朵行 → 植物色，茎叶 → 绿色渐变，地面 → 深绿
const MID_GREENS = ['#8ecf55', '#6db840', '#5aa832', '#4e9628', '#3f8020']

const getLineColor = (posInTemplate, flowerHeadLen, templateLength, plantColor) => {
  if (posInTemplate < flowerHeadLen) return plantColor
  if (posInTemplate === templateLength - 1) return '#2e6016'
  const stemPos = posInTemplate - flowerHeadLen
  const stemCount = Math.max(templateLength - flowerHeadLen - 1, 1)
  const ratio = stemPos / stemCount
  return MID_GREENS[Math.min(Math.floor(ratio * MID_GREENS.length), MID_GREENS.length - 1)]
}

// ─── 小草摇曳组件（帧切换：\ |  \ | /  \  | /  | /） ──────
// 4 个摇曳状态
const GF = ['\\ |', '\\ | /', '\\  | /', '| /']

// 不同节奏的帧序列
const GRASS_SEQ = [
  [GF[0], GF[1], GF[2], GF[1]],               // 左→中→右→中
  [GF[1], GF[2], GF[3], GF[2]],               // 中→右→最右→中
  [GF[0], GF[1], GF[0], GF[1]],               // 左右轻摆
  [GF[0], GF[1], GF[2], GF[3], GF[2], GF[1]], // 全幅扫
]

// tick 每 200ms +1，每根草每 5 tick（≈1s）换一帧
// phase 错开各自触发时机：phase*3 使相邻草之间相差 600ms
const TICKS_PER_FRAME = 5
const grassBlades = Array.from({ length: 15 }, (_, i) => ({
  id: i,
  x: 1.2 + (i / 15) * 97,
  y: 3 + (i * 7.3 + i * i * 0.4) % 50,
  seq: GRASS_SEQ[i % GRASS_SEQ.length],
  phase: i * 3,  // 相邻草错开 3 tick = 600ms
}))

const SwayingGrass = memo(() => {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick(t => (t + 1) % 300), 200)
    return () => clearInterval(id)
  }, [])

  return (
    <>
      {grassBlades.map(b => (
        <span
          key={b.id}
          className="sway-grass"
          style={{ left: `${b.x}%`, bottom: `${b.y}%` }}
        >
          {b.seq[Math.floor((tick + b.phase) / TICKS_PER_FRAME) % b.seq.length]}
        </span>
      ))}
    </>
  )
})

// ─── 单株植物（memo：只有自身 plant 对象变化时才重渲染）───────
const GardenPlant = memo(({ plant, onWater }) => {
  const handleClick = useCallback((e) => onWater(plant.id, e), [onWater, plant.id])
  const lines = plant.stages[plant.stage] ?? []

  return (
    <motion.div
      className="garden-plant"
      style={{
        left: `${plant.x}%`,
        bottom: `${plant.y}%`,
        x: '-50%',
        '--plant-color': plant.color,
      }}
      onClick={handleClick}
      whileHover={{ scale: 1.18 }}
      transition={{ type: 'spring', stiffness: 420, damping: 20 }}
    >
      <div className="gp-lines">
        <AnimatePresence initial={false}>
          {lines.map((line, displayIdx) => {
            // 用公式计算模板绝对位置，避免 indexOf 在重复字符串时出错
            const posInTemplate = plant.template.length - lines.length + displayIdx
            const isNewest = posInTemplate === plant.template.length - plant.stage
            const isFlowerPetal = posInTemplate === 0  // 花瓣最顶行用 bloom 动画
            const lineColor = getLineColor(posInTemplate, plant.flowerHeadLen, plant.template.length, plant.color)

            return (
              <motion.div
                key={posInTemplate}
                className="gp-line"
                style={{ color: lineColor }}
                initial={isNewest
                  ? isFlowerPetal
                    ? { opacity: 0, scaleX: 0.15, y: 3 }  // 花瓣：从中心向两侧绽放
                    : { opacity: 0, x: -5 }                 // 茎叶：从左滑入
                  : false}
                animate={{ opacity: 1, scaleX: 1, x: 0, y: 0 }}
                transition={isFlowerPetal && isNewest
                  ? { type: 'spring', stiffness: 200, damping: 9 }
                  : { duration: 0.2 }}
              >
                {line}
              </motion.div>
            )
          })}
        </AnimatePresence>

        {plant.stage === 0 && (
          <motion.div
            className="gp-line seed"
            style={{ color: plant.color }}
            animate={{ opacity: [0.25, 0.65, 0.25] }}
            transition={{ duration: 2.5, repeat: Infinity }}
          >
            ..
          </motion.div>
        )}
      </div>
    </motion.div>
  )
})

// ─── 主画布组件 ─────────────────────────────────────────────
export const GardenCanvas = () => {
  const [plants, setPlants] = useState(() => generatePlants(30))
  const [drops, setDrops] = useState([])
  const [isPouring, setIsPouring] = useState(false)

  const canvasRef = useRef(null)
  const pourTimerRef = useRef(null)

  const triggerPour = useCallback(() => {
    if (pourTimerRef.current) return
    setIsPouring(true)
    pourTimerRef.current = setTimeout(() => {
      setIsPouring(false)
      pourTimerRef.current = null
    }, 600)
  }, [])

  // 生成水滴（上限 60，防止粒子堆积卡顿）
  const spawnDrops = useCallback((originX, originY, color, count = 12) => {
    setDrops(prev => {
      if (prev.length >= 60) return prev  // 超出上限直接跳过
      const newDrops = Array.from({ length: count }, () => {
        const angle = (-Math.PI * 5 / 6) + Math.random() * (Math.PI * 2 / 3)
        const speed = 45 + Math.random() * 95
        return {
          id: uid++,
          x: originX,
          y: originY,
          char: DROP_CHARS[Math.floor(Math.random() * DROP_CHARS.length)],
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed + 55,
          color: color ?? 'rgb(120, 200, 255)',
        }
      })
      return [...prev, ...newDrops]
    })
  }, [])

  // 点击画布空白区域
  const handleCanvasClick = useCallback((e) => {
    triggerPour()
    spawnDrops(e.clientX, e.clientY, 'rgb(120, 200, 255)', 6)
  }, [triggerPour, spawnDrops])

  // 点击植物浇水（一次触发 2~3 步连续生长）
  const handleWaterPlant = useCallback((plantId, e) => {
    e.stopPropagation()
    triggerPour()

    const rect = e.currentTarget.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height * 0.25
    // 从 DOM CSS 变量拿颜色，避免闭包捕获旧 state
    const plantColor = e.currentTarget.style.getPropertyValue('--plant-color')

    // 随机 2~3 步（不超过植物剩余阶段数）
    const steps = Math.floor(Math.random() * 2) + 2

    for (let i = 0; i < steps; i++) {
      setTimeout(() => {
        // 水滴第一步多一点，后续少一点
        spawnDrops(cx, cy, plantColor, i === 0 ? 18 : 10)
        setPlants(prev =>
          prev.map(p =>
            p.id === plantId && p.stage < p.maxStage
              ? { ...p, stage: p.stage + 1 }
              : p
          )
        )
      }, i * 300)
    }
  }, [triggerPour, spawnDrops])

  const removeDrop = useCallback((id) => {
    setDrops(prev => prev.filter(d => d.id !== id))
  }, [])

  // 清理计时器
  useEffect(() => () => {
    if (pourTimerRef.current) clearInterval(pourTimerRef.current)
  }, [])

  const allGrown = plants.every(p => p.stage >= p.maxStage)

  return (
    <div
      ref={canvasRef}
      className="garden-canvas"
      onClick={handleCanvasClick}
    >
      {/* 顶部状态栏 */}
      <div className="canvas-header">
        <span className="header-file">// garden-canvas.jsx</span>
        <span className="header-stat">
          {allGrown
            ? '🌸 all bloomed'
            : `${plants.filter(p => p.stage >= p.maxStage).length} / ${plants.length} bloomed`}
        </span>
      </div>

      {/* 提示文字 */}
      <motion.div
        className="canvas-hint"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.8, duration: 1 }}
      >
        <span>click plants to water them</span>
      </motion.div>

      {/* 所有植物（onWater 传稳定引用，plant.id 绑定在组件内部）*/}
      {plants.map(plant => (
        <GardenPlant
          key={plant.id}
          plant={plant}
          onWater={handleWaterPlant}
        />
      ))}

      {/* 摇曳小草 */}
      <SwayingGrass />

      {/* 地面线 */}
      <div className="canvas-ground">
        {'~^~^~^^~^~~^~~^^~^~^~^^~^~~^~~^^~^~^~^^~^~~^~~^^~^~^~^^~^~~^~~^^~^~^~^^~^~~^~~^^~^~'}
      </div>

      {/* 引言 */}
      <div className="canvas-quote">
        "to plant a garden, is to believe in the future."
      </div>

      {/* 水壶 cursor（自管理鼠标位置，不触发父组件重渲染）*/}
      <WateringCanCursor canvasRef={canvasRef} isPouring={isPouring} />

      {/* 水滴粒子层 */}
      <AnimatePresence>
        {drops.map(d => (
          <AsciiDrop
            key={d.id}
            x={d.x}
            y={d.y}
            char={d.char}
            vx={d.vx}
            vy={d.vy}
            color={d.color}
            onComplete={() => removeDrop(d.id)}
          />
        ))}
      </AnimatePresence>
    </div>
  )
}
