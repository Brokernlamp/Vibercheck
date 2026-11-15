import requests
from flask import Flask, request

app = Flask(__name__)
app.config["SECRET_KEY"] = "python-dev-secret-key"


@app.route("/users")
def users():
    email = request.args.get("email")
    query = f"SELECT * FROM users WHERE email = '{email}'"
    return db.execute(query)


@app.route("/fetch")
def fetch():
    return requests.get(request.args["url"], verify=False)


if __name__ == "__main__":
    app.run(debug=True)
