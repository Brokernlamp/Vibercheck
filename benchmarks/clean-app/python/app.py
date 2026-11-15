import os

import requests
from flask import Flask, request

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ["SECRET_KEY"]


@app.route("/users")
def users():
    email = request.args.get("email")
    return db.execute("SELECT * FROM users WHERE email = %s", (email,))


@app.route("/fetch")
def fetch():
    return requests.get("https://api.example.com/status", verify=True)


if __name__ == "__main__":
    app.run(debug=False)
