import bcrypt from "bcryptjs"

const SALT_ROUNDS = 12

export async function hashPassword(password: string) {
  return bcrypt.hash(password, SALT_ROUNDS)
}

export async function comparePassword(plain: string, hash: string) {
  return bcrypt.compare(plain, hash)
}

export async function hashPin(pin: string) {
  return bcrypt.hash(pin, 10)
}

export async function comparePin(plain: string, hash: string) {
  return bcrypt.compare(plain, hash)
}
