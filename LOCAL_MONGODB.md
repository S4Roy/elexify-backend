# Local MongoDB transactions

Checkout and payment finalization require MongoDB transactions. A standalone
MongoDB server produces `Transaction numbers are only allowed on a replica set
member or mongos`. Use a single-node replica set for local development.

For an existing Homebrew MongoDB installation on Apple Silicon, back up
`/opt/homebrew/etc/mongod.conf`, then add this top-level configuration (preserve
its existing storage and network settings):

```yaml
replication:
  replSetName: elexifyLocalRs
```

Restart the installed service and initialize the set once:

```sh
brew services restart mongodb-community@8.0
mongosh 'mongodb://127.0.0.1:27017/admin?directConnection=true' --eval 'rs.initiate({_id:"elexifyLocalRs",members:[{_id:0,host:"localhost:27017"}]})'
```

Use your existing database name in the backend `.env` connection string:

```dotenv
MONGODB_URI=mongodb://127.0.0.1:27017/elexify_online?replicaSet=elexifyLocalRs
```

Wait for `rs.status()` to show `PRIMARY`, then restart the backend. This keeps
existing data in the configured database directory. Do not run the disposable
integration-test seed scripts against your development database.

See [MongoDB's standalone conversion instructions](https://www.mongodb.com/docs/manual/tutorial/convert-standalone-to-replica-set/).
