# Starter food catalogue

`foods_1.json` at the repository root contains 37 common foods for meal planning, extracted from the official USDA FoodData Central SR Legacy April 2018 CSV release. Each food preserves its FDC ID, original description and source link. The download URL and retrieval date are recorded in the JSON. Calories use nutrient 1008 (kcal), protein 1003 (g), carbohydrate 1005 (g), and total fat 1004 (g).

All values are for **100 g edible portion**, including milk and oil by weight. Raw, dry, cooked, drained and commercially prepared foods are identified explicitly; these states are not interchangeable. Reference values vary by brand and recipe. Coaches can create foods from a product label or edit their private copy. The catalogue is bundled locally; the application does not call an external nutrition database or require an API key.

## Coach workflow

Open **Nutrition → Foods**. Search/filter **Starter foods**, then choose **Add to my foods**. The food appears in the coach's existing library and is available in the meal builder. **Add food** continues to create custom foods. Imported foods use the existing Edit and Delete actions.

Repeated or concurrent adds create only one active copy per coach and never overwrite that coach's active edits. Adding a deleted catalogue food again restores it from the reference values. Copies belong to individual coaches, and saved meals and assigned plans retain their existing snapshots. Each add/restore and its audit event share a transaction.

## Maintaining the file

Keep food IDs stable and unique. The API validates the JSON at startup in development and in the production build. Keep the repository-root file with the API deployment, as with the exercise inputs. No food database migration or seed command is required. Restart the API after changing the catalogue.
