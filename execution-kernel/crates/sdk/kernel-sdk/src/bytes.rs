//! Safe byte manipulation helpers for agent development.
//!
//! This module provides utilities for working with byte arrays and slices
//! in a deterministic, safe manner. All operations:
//!
//! - Use explicit bounds checking
//! - Return `Option` or `Result` for fallible operations
//! - Are fully deterministic
//!
//! # Encoding
//!
//! All integer encoding uses **little-endian** byte order, consistent
//! with the kernel protocol specification.
//!
//! # Cursor-Style Reading
//!
//! For sequential payload decoding, use the `*_at` variants which
//! automatically advance an offset:
//!
//! ```
//! use kernel_sdk::bytes::*;
//!
//! let payload = [0x01, 0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00];
//! let mut offset = 0;
//!
//! let a = read_u32_le_at(&payload, &mut offset).unwrap();
//! let b = read_u32_le_at(&payload, &mut offset).unwrap();
//!
//! assert_eq!(a, 1);
//! assert_eq!(b, 2);
//! assert_eq!(offset, 8);
//! ```


// ============================================================================
// Reading Integers (Little-Endian) - Fixed Offset
// ============================================================================

/// Read a u16 from bytes at the given offset (little-endian).
///
/// Returns `None` if there are insufficient bytes.
#[inline]
pub fn read_u16_le(bytes: &[u8], offset: usize) -> Option<u16> {
    if offset.checked_add(2)? > bytes.len() {
        return None;
    }
    let arr: [u8; 2] = bytes[offset..offset + 2].try_into().ok()?;
    Some(u16::from_le_bytes(arr))
}

/// Read a u32 from bytes at the given offset (little-endian).
///
/// Returns `None` if there are insufficient bytes.
#[inline]
pub fn read_u32_le(bytes: &[u8], offset: usize) -> Option<u32> {
    if offset.checked_add(4)? > bytes.len() {
        return None;
    }
    let arr: [u8; 4] = bytes[offset..offset + 4].try_into().ok()?;
    Some(u32::from_le_bytes(arr))
}

/// Read a u64 from bytes at the given offset (little-endian).
///
/// Returns `None` if there are insufficient bytes.
#[inline]
pub fn read_u64_le(bytes: &[u8], offset: usize) -> Option<u64> {
    if offset.checked_add(8)? > bytes.len() {
        return None;
    }
    let arr: [u8; 8] = bytes[offset..offset + 8].try_into().ok()?;
    Some(u64::from_le_bytes(arr))
}

/// Read a u8 from bytes at the given offset.
///
/// Returns `None` if the offset is out of bounds.
#[inline]
pub fn read_u8(bytes: &[u8], offset: usize) -> Option<u8> {
    bytes.get(offset).copied()
}

/// Read a bool encoded as u8 from bytes at the given offset.
///
/// - Returns `Some(false)` if the byte is 0x00
/// - Returns `Some(true)` if the byte is 0x01
/// - Returns `None` for any other value or insufficient bytes
///
/// This strict interpretation avoids "any nonzero = true" ambiguity.
#[inline]
pub fn read_bool_u8(bytes: &[u8], offset: usize) -> Option<bool> {
    match read_u8(bytes, offset)? {
        0x00 => Some(false),
        0x01 => Some(true),
        _ => None,
    }
}

// ============================================================================
// Reading Integers (Little-Endian) - Cursor Style
// ============================================================================

/// Read a u16 and advance the offset (little-endian).
///
/// This is the cursor-style variant for sequential decoding.
/// Returns `None` if there are insufficient bytes or offset overflow.
#[inline]
pub fn read_u16_le_at(bytes: &[u8], offset: &mut usize) -> Option<u16> {
    let v = read_u16_le(bytes, *offset)?;
    *offset = offset.checked_add(2)?;
    Some(v)
}

/// Read a u32 and advance the offset (little-endian).
///
/// This is the cursor-style variant for sequential decoding.
/// Returns `None` if there are insufficient bytes or offset overflow.
#[inline]
pub fn read_u32_le_at(bytes: &[u8], offset: &mut usize) -> Option<u32> {
    let v = read_u32_le(bytes, *offset)?;
    *offset = offset.checked_add(4)?;
    Some(v)
}

/// Read a u64 and advance the offset (little-endian).
///
/// This is the cursor-style variant for sequential decoding.
/// Returns `None` if there are insufficient bytes or offset overflow.
#[inline]
pub fn read_u64_le_at(bytes: &[u8], offset: &mut usize) -> Option<u64> {
    let v = read_u64_le(bytes, *offset)?;
    *offset = offset.checked_add(8)?;
    Some(v)
}

/// Read a u8 and advance the offset.
///
/// This is the cursor-style variant for sequential decoding.
/// Returns `None` if there are insufficient bytes or offset overflow.
#[inline]
pub fn read_u8_at(bytes: &[u8], offset: &mut usize) -> Option<u8> {
    let v = read_u8(bytes, *offset)?;
    *offset = offset.checked_add(1)?;
    Some(v)
}

/// Read a bool encoded as u8 and advance the offset.
///
/// - Returns `Some(false)` if the byte is 0x00
/// - Returns `Some(true)` if the byte is 0x01
/// - Returns `None` for any other value or insufficient bytes
///
/// **On invalid values (not 0x00 or 0x01):** The offset is NOT advanced.
/// This "fail without consuming" behavior is consistent with typical
/// parser semantics where invalid input leaves the cursor unchanged.
///
/// This strict interpretation avoids "any nonzero = true" ambiguity.
#[inline]
pub fn read_bool_u8_at(bytes: &[u8], offset: &mut usize) -> Option<bool> {
    let saved = *offset;
    let v = read_u8_at(bytes, offset)?;
    match v {
        0x00 => Some(false),
        0x01 => Some(true),
        _ => {
            *offset = saved; // Don't consume on invalid
            None
        }
    }
}

// ============================================================================
// Reading Fixed-Size Arrays - Fixed Offset
// ============================================================================

/// Read a 20-byte array from bytes at the given offset.
///
/// Returns `None` if there are insufficient bytes.
#[inline]
pub fn read_bytes20(bytes: &[u8], offset: usize) -> Option<[u8; 20]> {
    if offset.checked_add(20)? > bytes.len() {
        return None;
    }
    let arr: [u8; 20] = bytes[offset..offset + 20].try_into().ok()?;
    Some(arr)
}

/// Read a 32-byte array from bytes at the given offset.
///
/// Returns `None` if there are insufficient bytes.
#[inline]
pub fn read_bytes32(bytes: &[u8], offset: usize) -> Option<[u8; 32]> {
    if offset.checked_add(32)? > bytes.len() {
        return None;
    }
    let arr: [u8; 32] = bytes[offset..offset + 32].try_into().ok()?;
    Some(arr)
}

/// Read a slice of `len` bytes from bytes at the given offset.
///
/// Returns `None` if there are insufficient bytes.
#[inline]
pub fn read_slice(bytes: &[u8], offset: usize, len: usize) -> Option<&[u8]> {
    let end = offset.checked_add(len)?;
    if end > bytes.len() {
        return None;
    }
    Some(&bytes[offset..end])
}

// ============================================================================
// Reading Fixed-Size Arrays - Cursor Style
// ============================================================================

/// Read a 20-byte array and advance the offset.
///
/// This is the cursor-style variant for sequential decoding.
/// Returns `None` if there are insufficient bytes or offset overflow.
#[inline]
pub fn read_bytes20_at(bytes: &[u8], offset: &mut usize) -> Option<[u8; 20]> {
    let v = read_bytes20(bytes, *offset)?;
    *offset = offset.checked_add(20)?;
    Some(v)
}

/// Read a 32-byte array and advance the offset.
///
/// This is the cursor-style variant for sequential decoding.
/// Returns `None` if there are insufficient bytes or offset overflow.
#[inline]
pub fn read_bytes32_at(bytes: &[u8], offset: &mut usize) -> Option<[u8; 32]> {
    let v = read_bytes32(bytes, *offset)?;
    *offset = offset.checked_add(32)?;
    Some(v)
}

/// Read a slice of `len` bytes and advance the offset.
///
/// This is the cursor-style variant for sequential decoding.
/// Returns `None` if there are insufficient bytes or offset overflow.
#[inline]
pub fn read_slice_at<'a>(bytes: &'a [u8], offset: &mut usize, len: usize) -> Option<&'a [u8]> {
    let v = read_slice(bytes, *offset, len)?;
    *offset = offset.checked_add(len)?;
    Some(v)
}

// ============================================================================
// Comparison Helpers
// ============================================================================

/// Check if a 32-byte array is all zeros.
#[inline]
pub fn is_zero_bytes32(value: &[u8; 32]) -> bool {
    *value == [0u8; 32]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_read_u16_le() {
        let bytes = [0x34, 0x12, 0xFF];
        assert_eq!(read_u16_le(&bytes, 0), Some(0x1234));
        assert_eq!(read_u16_le(&bytes, 1), Some(0xFF12));
        assert_eq!(read_u16_le(&bytes, 2), None); // Not enough bytes
    }

    #[test]
    fn test_read_u16_le_at() {
        let bytes = [0x01, 0x00, 0x02, 0x00];
        let mut offset = 0;

        assert_eq!(read_u16_le_at(&bytes, &mut offset), Some(1));
        assert_eq!(offset, 2);

        assert_eq!(read_u16_le_at(&bytes, &mut offset), Some(2));
        assert_eq!(offset, 4);

        // End of buffer
        assert_eq!(read_u16_le_at(&bytes, &mut offset), None);
    }

    #[test]
    fn test_read_bytes20() {
        let bytes = [0x42u8; 24];
        let result = read_bytes20(&bytes, 0);
        assert_eq!(result, Some([0x42u8; 20]));

        let result = read_bytes20(&bytes, 4);
        assert_eq!(result, Some([0x42u8; 20]));

        let result = read_bytes20(&bytes, 5);
        assert_eq!(result, None); // Not enough bytes
    }

    #[test]
    fn test_read_bytes20_at() {
        let bytes = [0x42u8; 44];
        let mut offset = 0;

        let arr = read_bytes20_at(&bytes, &mut offset).unwrap();
        assert_eq!(arr, [0x42u8; 20]);
        assert_eq!(offset, 20);

        let arr = read_bytes20_at(&bytes, &mut offset).unwrap();
        assert_eq!(arr, [0x42u8; 20]);
        assert_eq!(offset, 40);

        // Only 4 bytes left, not enough for another bytes20
        assert_eq!(read_bytes20_at(&bytes, &mut offset), None);
    }

    #[test]
    fn test_read_u32_le() {
        let bytes = [0x78, 0x56, 0x34, 0x12, 0xFF];
        assert_eq!(read_u32_le(&bytes, 0), Some(0x12345678));
        assert_eq!(read_u32_le(&bytes, 1), Some(0xFF123456));
        assert_eq!(read_u32_le(&bytes, 2), None); // Not enough bytes
    }

    #[test]
    fn test_read_u64_le() {
        let bytes = [0xF0, 0xDE, 0xBC, 0x9A, 0x78, 0x56, 0x34, 0x12];
        assert_eq!(read_u64_le(&bytes, 0), Some(0x123456789ABCDEF0));
        assert_eq!(read_u64_le(&bytes, 1), None); // Not enough bytes
    }

    #[test]
    fn test_read_u8() {
        let bytes = [0x42, 0x43];
        assert_eq!(read_u8(&bytes, 0), Some(0x42));
        assert_eq!(read_u8(&bytes, 1), Some(0x43));
        assert_eq!(read_u8(&bytes, 2), None);
    }

    #[test]
    fn test_cursor_style_reading() {
        let bytes = [
            0x01, 0x00, 0x00, 0x00, // u32 = 1
            0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // u64 = 2
            0x03, // u8 = 3
        ];
        let mut offset = 0;

        assert_eq!(read_u32_le_at(&bytes, &mut offset), Some(1));
        assert_eq!(offset, 4);

        assert_eq!(read_u64_le_at(&bytes, &mut offset), Some(2));
        assert_eq!(offset, 12);

        assert_eq!(read_u8_at(&bytes, &mut offset), Some(3));
        assert_eq!(offset, 13);

        // End of buffer
        assert_eq!(read_u8_at(&bytes, &mut offset), None);
    }

    #[test]
    fn test_read_bool_u8() {
        let bytes = [0x00, 0x01, 0x02, 0xFF];
        assert_eq!(read_bool_u8(&bytes, 0), Some(false));
        assert_eq!(read_bool_u8(&bytes, 1), Some(true));
        assert_eq!(read_bool_u8(&bytes, 2), None); // 0x02 is invalid
        assert_eq!(read_bool_u8(&bytes, 3), None); // 0xFF is invalid
        assert_eq!(read_bool_u8(&bytes, 4), None); // Out of bounds
    }

    #[test]
    fn test_read_bool_u8_at() {
        let bytes = [0x00, 0x01, 0x02, 0xFF];
        let mut offset = 0;

        // Valid values advance the offset
        assert_eq!(read_bool_u8_at(&bytes, &mut offset), Some(false));
        assert_eq!(offset, 1);
        assert_eq!(read_bool_u8_at(&bytes, &mut offset), Some(true));
        assert_eq!(offset, 2);

        // Invalid value (0x02) does NOT advance offset
        assert_eq!(read_bool_u8_at(&bytes, &mut offset), None);
        assert_eq!(offset, 2); // Unchanged - "fail without consuming"

        // Skip past invalid byte manually to test 0xFF
        offset = 3;
        assert_eq!(read_bool_u8_at(&bytes, &mut offset), None);
        assert_eq!(offset, 3); // Unchanged
    }

    #[test]
    fn test_read_bytes32_at() {
        let bytes = [0x42u8; 40];
        let mut offset = 0;

        let arr = read_bytes32_at(&bytes, &mut offset).unwrap();
        assert_eq!(arr, [0x42u8; 32]);
        assert_eq!(offset, 32);

        // Only 8 bytes left, not enough for another bytes32
        assert_eq!(read_bytes32_at(&bytes, &mut offset), None);
    }

    #[test]
    fn test_read_slice_at() {
        let bytes = [1, 2, 3, 4, 5, 6, 7, 8];
        let mut offset = 0;

        let slice = read_slice_at(&bytes, &mut offset, 3).unwrap();
        assert_eq!(slice, &[1, 2, 3]);
        assert_eq!(offset, 3);

        let slice = read_slice_at(&bytes, &mut offset, 3).unwrap();
        assert_eq!(slice, &[4, 5, 6]);
        assert_eq!(offset, 6);

        // Only 2 bytes left
        assert_eq!(read_slice_at(&bytes, &mut offset, 3), None);
    }

    #[test]
    fn test_read_bytes32() {
        let bytes = [0x42u8; 40];
        let result = read_bytes32(&bytes, 0);
        assert_eq!(result, Some([0x42u8; 32]));

        let result = read_bytes32(&bytes, 8);
        assert_eq!(result, Some([0x42u8; 32]));

        let result = read_bytes32(&bytes, 10);
        assert_eq!(result, None); // Not enough bytes
    }

    #[test]
    fn test_read_slice() {
        let bytes = [1, 2, 3, 4, 5];
        assert_eq!(read_slice(&bytes, 1, 3), Some(&[2, 3, 4][..]));
        assert_eq!(read_slice(&bytes, 3, 5), None); // Out of bounds
    }

    #[test]
    fn test_is_zero_bytes32() {
        assert!(is_zero_bytes32(&[0u8; 32]));
        let mut arr = [0u8; 32];
        arr[0] = 1;
        assert!(!is_zero_bytes32(&arr));
    }

}
