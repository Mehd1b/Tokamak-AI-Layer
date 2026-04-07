use sha2::{Digest, Sha256};
use std::env;
use std::fs;
use std::path::Path;

fn main() {
    // Re-run if lib.rs changes
    println!("cargo:rerun-if-changed=src/lib.rs");

    let src = fs::read(Path::new("src/lib.rs")).expect("cannot read src/lib.rs");
    let hash = Sha256::digest(&src);
    let hex = hash.iter().map(|b| format!("{:02x}", b)).collect::<String>();

    let out = env::var("OUT_DIR").unwrap();
    fs::write(
        Path::new(&out).join("agent_hash.rs"),
        format!(
            "/// SHA-256 of agent source at build time.\npub const AGENT_CODE_HASH: &str = \"0x{}\";\n",
            hex
        ),
    )
    .expect("cannot write agent_hash.rs");
}
