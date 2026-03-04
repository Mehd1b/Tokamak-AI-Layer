---
title: Manifest Schema
sidebar_position: 3
---

# Agent Pack Manifest Schema

This document provides the JSON Schema for Agent Pack manifests and detailed field specifications.

## JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "AgentPackManifest",
  "type": "object",
  "required": [
    "format_version",
    "agent_name",
    "agent_version",
    "agent_id",
    "protocol_version",
    "kernel_version",
    "agent_code_hash",
    "image_id",
    "artifacts"
  ],
  "properties": {
    "format_version": {
      "type": "string",
      "const": "1",
      "description": "Manifest format version"
    },
    "agent_name": {
      "type": "string",
      "minLength": 1,
      "description": "Human-readable agent name"
    },
    "agent_version": {
      "type": "string",
      "pattern": "^\\d+\\.\\d+\\.\\d+",
      "description": "Semantic version"
    },
    "agent_id": {
      "type": "string",
      "pattern": "^0x[a-fA-F0-9]{64}$",
      "description": "32-byte agent identifier"
    },
    "protocol_version": {
      "type": "integer",
      "minimum": 1,
      "description": "Kernel protocol version"
    },
    "kernel_version": {
      "type": "integer",
      "minimum": 1,
      "description": "Kernel semantics version"
    },
    "risc0_version": {
      "type": "string",
      "description": "RISC Zero version used"
    },
    "rust_toolchain": {
      "type": "string",
      "description": "Rust compiler version"
    },
    "agent_code_hash": {
      "type": "string",
      "pattern": "^0x[a-fA-F0-9]{64}$",
      "description": "SHA-256 of agent source"
    },
    "image_id": {
      "type": "string",
      "pattern": "^0x[a-fA-F0-9]{64}$",
      "description": "RISC Zero imageId"
    },
    "artifacts": {
      "type": "object",
      "required": ["elf_path", "elf_sha256"],
      "properties": {
        "elf_path": {
          "type": "string",
          "minLength": 1
        },
        "elf_sha256": {
          "type": "string",
          "pattern": "^0x[a-fA-F0-9]{64}$"
        }
      }
    },
    "build": {
      "type": "object",
      "properties": {
        "cargo_lock_sha256": {
          "type": "string",
          "pattern": "^0x[a-fA-F0-9]{64}$"
        },
        "build_command": {
          "type": "string"
        },
        "reproducible": {
          "type": "boolean"
        }
      }
    },
    "inputs": {
      "type": "string",
      "description": "Human-readable input format description"
    },
    "actions_profile": {
      "type": "string",
      "description": "Description of actions produced"
    },
    "networks": {
      "type": "object",
      "additionalProperties": {
        "type": "object",
        "properties": {
          "verifier": {
            "type": "string",
            "pattern": "^0x[a-fA-F0-9]{40}$"
          },
          "registered_image_id": {
            "type": "string",
            "pattern": "^0x[a-fA-F0-9]{64}$"
          }
        }
      }
    },
    "git": {
      "type": "object",
      "properties": {
        "repository": {
          "type": "string",
          "format": "uri"
        },
        "commit": {
          "type": "string",
          "pattern": "^[a-fA-F0-9]{40}$"
        }
      }
    },
    "notes": {
      "type": "string"
    }
  }
}
```

## Using the Schema

### With ajv-cli

```bash
npm install -g ajv-cli
ajv validate -s agent-pack.schema.json -d agent-pack.json
```

### In Node.js

```javascript
const Ajv = require('ajv');
const ajv = new Ajv();

const schema = require('./agent-pack.schema.json');
const manifest = require('./agent-pack.json');

const validate = ajv.compile(schema);
const valid = validate(manifest);

if (!valid) {
    console.error(validate.errors);
}
```

### In Rust

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct AgentPackManifest {
    pub format_version: String,
    pub agent_name: String,
    pub agent_version: String,
    pub agent_id: String,
    pub protocol_version: u32,
    pub kernel_version: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub risc0_version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub rust_toolchain: Option<String>,
    pub agent_code_hash: String,
    pub image_id: String,
    pub artifacts: Artifacts,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub build: Option<BuildInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub inputs: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub actions_profile: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub networks: Option<HashMap<String, NetworkInfo>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub git: Option<GitInfo>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Artifacts {
    pub elf_path: String,
    pub elf_sha256: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct BuildInfo {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cargo_lock_sha256: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub build_command: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reproducible: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct NetworkInfo {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub verifier: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub registered_image_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GitInfo {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub repository: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub commit: Option<String>,
}
```

## Field Validation Rules

### Hex Strings

All cryptographic values use hex encoding:
- Must start with `0x`
- Must contain only hex characters `[0-9a-fA-F]`
- Must have correct length (64 chars for 32 bytes, 40 chars for 20 bytes)

```regex
^0x[a-fA-F0-9]{64}$   # 32-byte values
^0x[a-fA-F0-9]{40}$   # 20-byte addresses
```

### Version Strings

Semantic versioning:

```regex
^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?(\+[a-zA-Z0-9.]+)?$
```

Examples:
- `1.0.0` ✓
- `1.0.0-beta.1` ✓
- `1.0.0+build.123` ✓
- `v1.0.0` ✗ (no v prefix)

### Git Commit

Full SHA-1 hash:

```regex
^[a-fA-F0-9]{40}$
```

## Example Manifest

```json
{
  "format_version": "1",
  "agent_name": "yield-agent",
  "agent_version": "1.0.0",
  "agent_id": "0x0000000000000000000000000000000000000000000000000000000000000001",

  "protocol_version": 1,
  "kernel_version": 1,
  "risc0_version": "1.0.0",
  "rust_toolchain": "1.75.0",

  "agent_code_hash": "0x5aac6b1fedf1b0c0ccc037c3223b7b5c8b679f48b9c599336c0dc777be88924b",
  "image_id": "0x5f42241afd61bf9e341442c8baffa9c544cf20253720f2540cf6705f27bae2c4",

  "artifacts": {
    "elf_path": "./zkvm-guest",
    "elf_sha256": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890"
  },

  "build": {
    "cargo_lock_sha256": "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    "build_command": "RISC0_USE_DOCKER=1 cargo build --release -p risc0-methods",
    "reproducible": true
  },

  "inputs": "48 bytes: vault_address (20 bytes) + yield_source (20 bytes) + amount (8 bytes, u64 LE)",
  "actions_profile": "Produces 2 CALL actions: (1) deposit ETH to yield source, (2) withdraw deposit + yield",

  "networks": {
    "sepolia": {
      "verifier": "0x1eB41537037fB771CBA8Cd088C7c806936325eB5",
      "registered_image_id": "0x5f42241afd61bf9e341442c8baffa9c544cf20253720f2540cf6705f27bae2c4"
    }
  },

  "git": {
    "repository": "https://github.com/tokamak-network/Tokamak-AI-Layer",
    "commit": "abc123def456789012345678901234567890abcd"
  },

  "notes": "Example yield farming agent for demonstration and testing purposes. Deposits ETH to MockYieldSource and withdraws with 10% yield."
}
```

## Related

- [Agent Pack Format](/agent-pack/format) - Format overview
- [Verification](/agent-pack/verification) - Verification process
