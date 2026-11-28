-- InsertData
INSERT INTO "card_conditions" ("id", "name", "sort_order") VALUES
    ('0190a000-0000-7025-8855-82876fd0f8bf', 'Mint', 1),
    ('0190a000-0000-7025-82e6-bb78735c67a5', 'Near Mint', 2),
    ('0190a000-0000-7025-8d4e-10ca35e90464', 'Ótimo', 3),
    ('0190a000-0000-7025-89ed-86facfcaee1f', 'Bom', 4),
    ('0190a000-0000-7025-8efd-dfc2418c1701', 'Regular', 5)
ON CONFLICT ("name") DO NOTHING;
