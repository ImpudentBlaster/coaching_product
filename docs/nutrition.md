# Nutrition library

The coach's Nutrition workspace uses **Plans → Days → Meals → Foods**.

- Foods are entered manually with a serving size and unit (`g`, `ml`, or `piece`) and calories, protein, carbohydrates and fat for that serving.
- Meals contain ordered food references and quantities in the food's unit. Values scale by quantity / serving size. A meal supports up to 30 food rows.
- Days contain up to 12 ordered meals, each with a label such as Breakfast or Dinner. Day totals sum those meal portions.
- Plans contain up to 31 ordered, labelled days. Each day retains its own totals; a plan does not present the sum of all days as a daily target.
- Complete plans can be assigned to approved clients. Assignment replaces the client's active meal plan and preserves the previous assignment record.

Entries are reusable templates. Compositions save server-resolved snapshots of their selected children, preserving quantities, ordering, labels and nutrition values. Existing assignments retain their snapshots when a library entry is edited or deleted.

Nutrition also contains **Supplements**, a standalone library independent of foods, meals, days and meal plans. Each supplement plan has a title, up to 50 supplement rows (name, timings, dosage, optional HTTP/HTTPS purchase link), and additional notes. Coaches can create, edit, delete and assign these plans to approved clients, or include one in a coaching package and client setup. The coach's client information page shows the assigned supplement plan under Nutrition and its title in Overview. Clients see it in their Nutrition section, even without an assigned meal plan. Reassignment replaces only the active supplement plan. All mutations and their audit events share a transaction.

Apply migration `014_supplement_plans.sql` using `pnpm --filter @coaching/api db:migrate` after building the API. Supplements use `nutrition_library` with kind `supplements` and a separate `supplement_plan_assignments` table.

Clients see the assigned plan under Nutrition, expand meals to inspect foods and portions, and retain the existing manual daily nutrition log. Historical numeric targets are preserved separately. No food intake is inferred from assignment.

## API and storage

- `GET /api/v1/coach/nutrition-library`: coach-owned entries and active assignment summaries.
- `POST /api/v1/coach/nutrition-library/{foods|meals|days|plans}`: create a template. Foods accept `name`, `notes`, `servingSize`, `unit`, and `nutrients` (`calories`, `protein`, `carbs`, `fat`). Meals accept `items: [{id, quantity}]`; days and plans accept `items: [{id, label}]`.
- `POST /api/v1/coach/nutrition-library/plans/:id/assign`: assign using `{clientId}`.
- `GET /api/v1/client/nutrition-plan`: current assignment snapshot, or null.

All endpoints require a currently approved account and the appropriate role. Child references must belong to the coach and the immediately lower hierarchy level. Assignment locks the client and approved relationship, ensuring concurrent replacements cannot create two active assignments. Creation and assignment audit events share their mutation transaction. Client reads recheck the coach's approval and relationship status.

Migration `003_nutrition_library.sql` adds the template and assignment tables without changing existing nutrition logs or targets. Apply through the existing repository command after building:

```sh
pnpm --filter @coaching/api db:migrate
```

The API nutrition integration tests use a disposable PostgreSQL schema when `DATABASE_URL` is available (including the local API `.env`). They validate the migrations, full hierarchy, scaled totals, authorization, assignment replacement, and rollback on audit failure. They never use existing clients or plans as fixtures.
