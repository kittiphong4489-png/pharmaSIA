#!/usr/bin/env python3
"""Add logApiError to Batch A catch blocks in boot.ts"""

with open('api/boot.ts') as f:
    text = f.read()

patches = [
    # 1. PUT /api/seller/orders/:id/status - has db, id
    (
        '    eventBus.emit(createEvent(EventType.STATUS_UPDATED, "boot.ts:orders", {',
        '    } catch (e: any) {\n    return c.json({ success: false, error: e?.message }, 500);\n  }\n});\n\napp.get("/api/seller/orders/:id"',
        '    } catch (e: any) {\n    await logApiError(c, db, "update_order_status", "order", id, e);\n    return c.json({ success: false, error: e?.message }, 500);\n  }\n});\n\napp.get("/api/seller/orders/:id"'
    ),
    # 2. POST /api/upload/image - no db
    (
        '    return c.json({ success: true, url: `/api/images/${filename}` });',
        '    } catch (e: any) {\n    return c.json({ success: false, error: e?.message }, 500);\n  }\n});\n\napp.post("/api/products/:id/featured"',
        '    } catch (e: any) {\n    const db2 = getDb(); await logApiError(c, db2, "upload_image", "image", null, e);\n    return c.json({ success: false, error: e?.message }, 500);\n  }\n});\n\napp.post("/api/products/:id/featured"'
    ),
    # 3. POST /api/admin/clear-images - no db
    (
        '    return c.json({ success: true, deleted });',
        '    } catch (e: any) { return c.json({ error: e.message }, 500); }\n});\n\n// ── Invoice PDF ──',
        '    } catch (e: any) {\n    const db2 = getDb(); await logApiError(c, db2, "clear_images", "image", null, e);\n    return c.json({ error: e?.message }, 500);\n  }\n});\n\n// ── Invoice PDF ──'
    ),
    # 4. PUT /api/seller/settings - has db
    (
        '    return c.json({ success: true, settings });',
        '    } catch (e: any) {\n    return c.json({ success: false, error: e?.message }, 500);\n  }\n});\n\napp.put("/api/seller/pricing/product/:id"',
        '    } catch (e: any) {\n    await logApiError(c, db, "update_settings", "settings", null, e);\n    return c.json({ success: false, error: e?.message }, 500);\n  }\n});\n\napp.put("/api/seller/pricing/product/:id"'
    ),
    # 5. POST /api/accounting/from-order/:orderId - has db
    (
        '    return c.json({ success: true, id: result.lastInsertRowid }, 201);',
        '    } catch (e: any) {\n    return c.json({ success: false, error: e?.message }, 500);\n  }\n});\n\napp.post("/api/payments/create"',
        '    } catch (e: any) {\n    await logApiError(c, db, "accounting_from_order", "accounting", orderId, e);\n    return c.json({ success: false, error: e?.message }, 500);\n  }\n});\n\napp.post("/api/payments/create"'
    ),
    # 6. POST /api/accounting/transactions - has db
    (
        '    return c.json({ success: true, id: result.lastInsertRowid, transaction: db.prepare("SELECT * FROM account_transactions WHERE id = ?").get(result.lastInsertRowid) }, 201);',
        '    } catch (e: any) {\n    return c.json({ success: false, error: e?.message }, 500);\n  }\n});\n\napp.delete("/api/accounting/transactions/:id"',
        '    } catch (e: any) {\n    await logApiError(c, db, "create_accounting_tx", "accounting", null, e);\n    return c.json({ success: false, error: e?.message }, 500);\n  }\n});\n\napp.delete("/api/accounting/transactions/:id"'
    ),
    # 7. POST /api/orders/prescription - no db
    (
        '    return c.json({ success: true });',
        '    } catch (e: any) {\n    return c.json({ success: false, error: e?.message }, 500);\n  }\n});\n\napp.put("/api/admin/prescriptions/:id/approve"',
        '    } catch (e: any) {\n    const db2 = getDb(); await logApiError(c, db2, "upload_prescription", "prescription", orderId, e);\n    return c.json({ success: false, error: e?.message }, 500);\n  }\n});\n\napp.put("/api/admin/prescriptions/:id/approve"'
    ),
]

applied = 0
failed = 0
for start_marker, old_catch, new_catch in patches:
    # Find the old_catch in the text and replace it
    start_idx = text.find(start_marker)
    if start_idx == -1:
        print(f"  ❌ Start marker not found: {start_marker[:50]}")
        failed += 1
        continue
    
    old_idx = text.find(old_catch, start_idx)
    if old_idx == -1:
        print(f"  ❌ Catch not found after marker: {start_marker[:50]}")
        failed += 1
        continue
    
    text = text[:old_idx] + new_catch + text[old_idx + len(old_catch):]
    applied += 1
    print(f"  ✅ Applied: {start_marker[:50]}")

with open('api/boot.ts', 'w') as f:
    f.write(text)

with open('api/boot.ts') as f:
    final = f.read()
count = final.count('logApiError')
print(f"\n✅ Applied {applied}/{len(patches)}. Total logApiError: {count}")
