import bcrypt from 'bcryptjs';
import { env } from '../config/env';

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,64}$/;

export const isStrongPassword = (password: string): boolean => PASSWORD_REGEX.test(password);

export const hashPassword = (password: string): Promise<string> => bcrypt.hash(password, env.BCRYPT_SALT_ROUNDS);

export const comparePassword = (password: string, hash: string): Promise<boolean> => bcrypt.compare(password, hash);
