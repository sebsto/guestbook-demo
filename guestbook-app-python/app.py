from flask import Flask
from flask import request
from flask import render_template
from flask import redirect, url_for


from db import read_messages
from db import post_message

app = Flask(__name__)

@app.route('/', methods=['GET'])
def main():
    rows = read_messages()
    print(rows)
    return render_template('index.html', { rows: rows })

@app.route('/', methods=['POST'])
def post():
    if request.form['name'] or request.form['message']:
        return redirect(url_for('main'))

    post_message(name=request.form['name'],message=request.form['message'])
    return redirect(url_for('main'))
        
