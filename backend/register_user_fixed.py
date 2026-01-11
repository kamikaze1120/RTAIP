import requests
import json

url = "http://127.0.0.1:8000/users/register"
data = {
    "username": "MOHAMMM",
    "email": "user@example.com",
    "password": "Andromeda@786"
}
headers = {
    "Content-Type": "application/json"
}

response = requests.post(url, data=json.dumps(data), headers=headers)

print(response.status_code)
print(response.text)