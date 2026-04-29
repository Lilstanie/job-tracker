import { Redis } from '@upstash/redis'
import { createClient } from 'redis'

const memoryStore = new Map()

function hasRedisEnv() {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
}

function getRedisClient() {
  if (!hasRedisEnv()) return null
  try {
    return Redis.fromEnv()
  } catch (err) {
    console.error('[sessionStore] Redis init failed, fallback to memory:', err.message)
    return null
  }
}

const redis = getRedisClient()
const redisUrl = process.env.REDIS_URL || null
const redisNodeClient = redisUrl ? createClient({ url: redisUrl }) : null
let redisNodeReady = false
let redisNodeConnectPromise = null

async function ensureNodeRedisReady() {
  if (!redisNodeClient) return false
  if (redisNodeReady) return true
  if (!redisNodeConnectPromise) {
    redisNodeConnectPromise = redisNodeClient.connect()
      .then(() => { redisNodeReady = true })
      .catch((err) => {
        console.error('[sessionStore] REDIS_URL connect failed, fallback to memory:', err.message)
        redisNodeConnectPromise = null
        return false
      })
  }
  const result = await redisNodeConnectPromise
  return result !== false
}

const KEY_PREFIX = 'gmail:session:'
const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 14 // 14 days

function key(syncToken) {
  return `${KEY_PREFIX}${syncToken}`
}

export function usingRedisStore() {
  return Boolean(redis || redisNodeClient)
}

export async function getSession(syncToken) {
  if (!syncToken) return null
  if (redis) return redis.get(key(syncToken))
  if (await ensureNodeRedisReady()) {
    const raw = await redisNodeClient.get(key(syncToken))
    if (!raw) return null
    try {
      return JSON.parse(raw)
    } catch {
      return null
    }
  }
  return memoryStore.get(syncToken) ?? null
}

export async function setSession(syncToken, payload, ttlSeconds = DEFAULT_TTL_SECONDS) {
  if (!syncToken) return
  if (redis) {
    await redis.set(key(syncToken), payload, { ex: ttlSeconds })
    return
  }
  if (await ensureNodeRedisReady()) {
    await redisNodeClient.set(key(syncToken), JSON.stringify(payload), { EX: ttlSeconds })
    return
  }
  memoryStore.set(syncToken, payload)
}

export async function deleteSession(syncToken) {
  if (!syncToken) return
  if (redis) {
    await redis.del(key(syncToken))
    return
  }
  if (await ensureNodeRedisReady()) {
    await redisNodeClient.del(key(syncToken))
    return
  }
  memoryStore.delete(syncToken)
}
