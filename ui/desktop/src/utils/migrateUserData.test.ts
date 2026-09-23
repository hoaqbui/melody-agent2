import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { migrateUserData } from './migrateUserData';

describe('migrateUserData', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'migrate-test-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('copies the source folder to destination', () => {
    const fromDir = path.join(tempDir, 'Goose');
    const toDir = path.join(tempDir, 'Melody');

    fs.mkdirSync(fromDir);
    fs.writeFileSync(path.join(fromDir, 'settings.json'), '{}');
    fs.writeFileSync(path.join(fromDir, 'data.txt'), 'test data');

    const result = migrateUserData(tempDir, 'Goose', 'Melody');

    expect(result).toBe('copied');
    expect(fs.existsSync(path.join(toDir, 'settings.json'))).toBe(true);
    expect(fs.existsSync(path.join(toDir, 'data.txt'))).toBe(true);
    expect(fs.readFileSync(path.join(toDir, 'data.txt'), 'utf-8')).toBe('test data');
  });

  it('skips when target settings.json already exists', () => {
    const fromDir = path.join(tempDir, 'Goose');
    const toDir = path.join(tempDir, 'Melody');

    fs.mkdirSync(fromDir);
    fs.writeFileSync(path.join(fromDir, 'settings.json'), '{}');

    fs.mkdirSync(toDir);
    fs.writeFileSync(path.join(toDir, 'settings.json'), '{}');
    fs.writeFileSync(path.join(toDir, 'existing.txt'), 'existing data');

    const result = migrateUserData(tempDir, 'Goose', 'Melody');

    expect(result).toBe('skipped');
    expect(fs.readFileSync(path.join(toDir, 'existing.txt'), 'utf-8')).toBe('existing data');
  });

  it('skips when source settings.json does not exist', () => {
    const fromDir = path.join(tempDir, 'Goose');
    const toDir = path.join(tempDir, 'Melody');

    fs.mkdirSync(fromDir);
    fs.mkdirSync(toDir);

    const result = migrateUserData(tempDir, 'Goose', 'Melody');

    expect(result).toBe('skipped');
  });

  it('does not copy Singleton* files and directories', () => {
    const fromDir = path.join(tempDir, 'Goose');
    const toDir = path.join(tempDir, 'Melody');

    fs.mkdirSync(fromDir);
    fs.writeFileSync(path.join(fromDir, 'settings.json'), '{}');
    fs.mkdirSync(path.join(fromDir, 'SingletonLock'));
    fs.writeFileSync(path.join(fromDir, 'SingletonFile.tmp'), 'should skip');
    fs.writeFileSync(path.join(fromDir, 'regular.txt'), 'should copy');

    const result = migrateUserData(tempDir, 'Goose', 'Melody');

    expect(result).toBe('copied');
    expect(fs.existsSync(path.join(toDir, 'SingletonLock'))).toBe(false);
    expect(fs.existsSync(path.join(toDir, 'SingletonFile.tmp'))).toBe(false);
    expect(fs.existsSync(path.join(toDir, 'regular.txt'))).toBe(true);
  });

  it('does not copy cache directories', () => {
    const fromDir = path.join(tempDir, 'Goose');
    const toDir = path.join(tempDir, 'Melody');

    fs.mkdirSync(fromDir);
    fs.writeFileSync(path.join(fromDir, 'settings.json'), '{}');

    const cacheNames = ['Cache', 'Code Cache', 'GPUCache', 'DawnGraphiteCache', 'DawnWebGPUCache'];
    for (const cacheName of cacheNames) {
      fs.mkdirSync(path.join(fromDir, cacheName));
      fs.writeFileSync(path.join(fromDir, cacheName, 'file.db'), 'cache data');
    }

    fs.writeFileSync(path.join(fromDir, 'data.txt'), 'keep this');

    const result = migrateUserData(tempDir, 'Goose', 'Melody');

    expect(result).toBe('copied');
    for (const cacheName of cacheNames) {
      expect(fs.existsSync(path.join(toDir, cacheName))).toBe(false);
    }
    expect(fs.existsSync(path.join(toDir, 'data.txt'))).toBe(true);
  });

  it('does not modify the source folder', () => {
    const fromDir = path.join(tempDir, 'Goose');

    fs.mkdirSync(fromDir);
    fs.writeFileSync(path.join(fromDir, 'settings.json'), '{}');
    fs.writeFileSync(path.join(fromDir, 'data.txt'), 'test data');

    const originalSettingsContent = fs.readFileSync(path.join(fromDir, 'settings.json'), 'utf-8');
    const originalDataContent = fs.readFileSync(path.join(fromDir, 'data.txt'), 'utf-8');

    migrateUserData(tempDir, 'Goose', 'Melody');

    expect(fs.readFileSync(path.join(fromDir, 'settings.json'), 'utf-8')).toBe(
      originalSettingsContent
    );
    expect(fs.readFileSync(path.join(fromDir, 'data.txt'), 'utf-8')).toBe(originalDataContent);
  });
});
