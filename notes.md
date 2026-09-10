# Learning notes

## JWT Pizza code study and debugging

As part of `Deliverable ⓵ Development deployment: JWT Pizza`, start up the application and debug through the code until you understand how it works. During the learning process fill out the following required pieces of information in order to demonstrate that you have successfully completed the deliverable.

| User activity                                       | Frontend component | Backend endpoints | Database SQL |
| --------------------------------------------------- | ------------------ | ----------------- | ------------ |
| View home page                                      | `home.tsx`         | none              | none         |
| Register new user<br/>(t@jwt.com, pw: test)         | `register.tsx`     | `[POST] /api/auth` | `INSERT INTO user (name, email, password) VALUES (?, ?, ?)` <br/>`INSERT INTO userRole (userId, role, objectId) VALUES (?, ?, ?)` <br/>`INSERT INTO auth (token, userId) VALUES (?, ?) ON DUPLICATE KEY UPDATE token=token` |
| Login new user<br/>(t@jwt.com, pw: test)            | `login.tsx`        | `[PUT] /api/auth`  | `SELECT * FROM user WHERE email=?` <br/>`SELECT * FROM userRole WHERE userId=?` <br/>`INSERT INTO auth (token, userId) VALUES (?, ?) ON DUPLICATE KEY UPDATE token=token` |
| Order pizza                                         | `menu.tsx` <br/>`payment.tsx` | `[GET] /api/order/menu` <br/>`[GET] /api/franchise?page=0&limit=20&name=*` <br/>`[GET] /api/user/me` <br/>`[POST] /api/order` | `SELECT * FROM menu` <br/>`SELECT id, name FROM franchise WHERE name LIKE ? LIMIT 21 OFFSET 0` <br/>`SELECT id, name FROM store WHERE franchiseId=?` <br/>`SELECT userId FROM auth WHERE token=?` <br/>`INSERT INTO dinerOrder (dinerId, franchiseId, storeId, date) VALUES (?, ?, ?, now())` <br/>`SELECT id FROM menu WHERE id=?` <br/>`INSERT INTO orderItem (orderId, menuId, description, price) VALUES (?, ?, ?, ?)` |
| Verify pizza                                        | `delivery.tsx`     | `[POST] https://pizza-factory.cs329.click/api/order/verify` (JWT Pizza Factory; the jwt-pizza-service backend is not called) | none         |
| View profile page                                   |                    |                   |              |
| View franchise<br/>(as diner)                       |                    |                   |              |
| Logout                                              | `logout.tsx`       | `[DELETE] /api/auth` | `SELECT userId FROM auth WHERE token=?` <br/>`DELETE FROM auth WHERE token=?` |
| View About page                                     | `about.tsx`        | none              | none         |
| View History page                                   | `history.tsx`      | none              | none         |
| Login as franchisee<br/>(f@jwt.com, pw: franchisee) |                    |                   |              |
| View franchise<br/>(as franchisee)                  |                    |                   |              |
| Create a store                                      |                    |                   |              |
| Close a store                                       |                    |                   |              |
| Login as admin<br/>(a@jwt.com, pw: admin)           |                    |                   |              |
| View Admin page                                     |                    |                   |              |
| Create a franchise for t@jwt.com                    |                    |                   |              |
| Close the franchise for t@jwt.com                   |                    |                   |              |
