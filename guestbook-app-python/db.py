import os 
import mysql.connector
from secretManager import get_secret 

AWS_REGION=os.environ.get('GUESTBOOK_REGION', 'eu-central-1')
AWS_SECRET=os.environ.get('GUESTBOOK_SECRET_NAME')
print(f"AWS REGION={AWS_REGION}")
print(f"AWS_SECRET={AWS_SECRET}")

db = None  

def prepare_db_schema(databaseName):
    query = f'CREATE DATABASE IF NOT EXISTS {databaseName}; \
              CREATE TABLE IF NOT EXISTS {databaseName}.guestbook ( \
                     id INT NOT NULL AUTO_INCREMENT, \
                     name VARCHAR(32) NOT NULL, \
                     message TEXT NULL, \
                     date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP, \
                     PRIMARY KEY (id));'
    return execute_query(query)

def read_messages():
    global db
    query = 'SELECT * FROM guestbook ORDER BY date DESC;'
    cursor = execute_query(query)
    return cursor.fetchall()

def post_message(name, message):
    query = 'INSERT INTO guestbook(name, message) VALUE(%s, %s);'
    values = (name, message)
    return execute_query(query, values)

# 
# private methods 
# 

def execute_query(query, values=None):
    global db
    if db is None:
        db = get_connection()
    cursor = db.cursor()
    if values is None:
        cursor.execute(query)
        return cursor
    else:
        cursor.execute(query, values)
        db.commit()
        return cursor.rowcount

def get_connection():
    print("Getting secret")
    secret = get_secret(region_name=AWS_REGION, secret_name=AWS_SECRET)
    return connect(username=secret['username'], password=secret['password'], database=secret['dbname'], host=secret['host'], port=secret['port'])

def connect(username, password, database, host, port=3306):
    global db
    if db is None:
        print("Connecting to the database")
        db = mysql.connector.connect(host=host, port=port, database=database, user=username, password=password)
    return db

