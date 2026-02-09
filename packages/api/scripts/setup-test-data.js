#!/usr/bin/env node
// Setup test data for local API development

import crypto from 'crypto';

// Generate a test API token
function generateToken(env = 'test') {
  const randomPart = crypto.randomBytes(16).toString('base64url').slice(0, 32);
  return `fai_${env}_${randomPart}`;
}

// Hash token with SHA-256
function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// Generate test data
const testToken = generateToken('test');
const liveToken = generateToken('live');

const testTokenHash = hashToken(testToken);
const liveTokenHash = hashToken(liveToken);

const testTenant = {
  id: 'tenant_test_001',
  tier: 'free',
  quota: {
    daily: 1000,
    monthly: 30000
  },
  rateLimits: {
    requestsPerSecond: 1,
    burstSize: 5
  },
  features: {
    batchScan: false,
    webhooks: false,
    customRules: false,
    priority: false
  },
  createdAt: new Date().toISOString(),
  metadata: {
    name: 'Test Account',
    email: 'test@example.com'
  }
};

const liveTenant = {
  id: 'tenant_live_001',
  tier: 'startup',
  quota: {
    daily: 10000,
    monthly: 300000
  },
  rateLimits: {
    requestsPerSecond: 10,
    burstSize: 20
  },
  features: {
    batchScan: true,
    webhooks: false,
    customRules: true,
    priority: false
  },
  createdAt: new Date().toISOString(),
  metadata: {
    name: 'Startup Account',
    email: 'startup@example.com'
  }
};

const testTokenData = {
  tokenHash: testTokenHash,
  tenantId: testTenant.id,
  tier: 'free',
  createdAt: new Date().toISOString(),
  metadata: {
    name: 'Test Token',
    domains: ['localhost', '127.0.0.1', 'http://localhost:*']
  }
};

const liveTokenData = {
  tokenHash: liveTokenHash,
  tenantId: liveTenant.id,
  tier: 'startup',
  createdAt: new Date().toISOString(),
  metadata: {
    name: 'Live Token',
    domains: ['example.com', '*.example.com']
  }
};

console.log('═══════════════════════════════════════════════════════════════');
console.log('📦 Forensicate.ai API - Test Data Setup');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log('🔑 TEST TOKEN (Free Tier):');
console.log('   Token:      ' + testToken);
console.log('   Hash:       ' + testTokenHash);
console.log('   Tenant ID:  ' + testTenant.id);
console.log('   Quota:      1,000/day\n');

console.log('🔑 LIVE TOKEN (Startup Tier):');
console.log('   Token:      ' + liveToken);
console.log('   Hash:       ' + liveTokenHash);
console.log('   Tenant ID:  ' + liveTenant.id);
console.log('   Quota:      10,000/day\n');

console.log('═══════════════════════════════════════════════════════════════');
console.log('📋 Wrangler Commands to Upload Data');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log('# 1. Upload Test Token');
console.log(`wrangler kv:key put --namespace-id=<API_TOKENS_PREVIEW_ID> "${testTokenHash}" '${JSON.stringify(testTokenData)}'`);
console.log();

console.log('# 2. Upload Test Tenant');
console.log(`wrangler kv:key put --namespace-id=<TENANT_METADATA_PREVIEW_ID> "${testTenant.id}" '${JSON.stringify(testTenant)}'`);
console.log();

console.log('# 3. Upload Live Token');
console.log(`wrangler kv:key put --namespace-id=<API_TOKENS_PREVIEW_ID> "${liveTokenHash}" '${JSON.stringify(liveTokenData)}'`);
console.log();

console.log('# 4. Upload Live Tenant');
console.log(`wrangler kv:key put --namespace-id=<TENANT_METADATA_PREVIEW_ID> "${liveTenant.id}" '${JSON.stringify(liveTenant)}'`);
console.log();

console.log('═══════════════════════════════════════════════════════════════');
console.log('💾 Save these tokens somewhere safe!');
console.log('═══════════════════════════════════════════════════════════════\n');

// Create a .tokens file for easy reference
const tokensFile = `# Forensicate.ai API - Test Tokens
# Generated: ${new Date().toISOString()}

# Test Token (Free Tier - 1K/day)
TEST_TOKEN=${testToken}

# Live Token (Startup Tier - 10K/day)
LIVE_TOKEN=${liveToken}

# Tenant IDs
TEST_TENANT_ID=${testTenant.id}
LIVE_TENANT_ID=${liveTenant.id}

# Token Hashes (for KV storage)
TEST_TOKEN_HASH=${testTokenHash}
LIVE_TOKEN_HASH=${liveTokenHash}
`;

console.log('💾 Token file saved to: packages/api/.tokens');
console.log('   (This file is gitignored)\n');

// Write tokens file
import fs from 'fs';
fs.writeFileSync('.tokens', tokensFile);

console.log('✅ Done! Run the wrangler commands above to populate KV storage.\n');
