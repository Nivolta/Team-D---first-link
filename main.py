"""Read fictional Student records. Start the application with: python run.py"""

import json
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="Student API")

# Locate the JSON beside this Python file, even from another working directory.
STUDENTS_FILE = Path(__file__).resolve().parent / "data" / "students.json"
FRONTEND_DIR = Path(__file__).resolve().parent / "frontend"
app.mount("/assets", StaticFiles(directory=FRONTEND_DIR), name="assets")


def load_students():
    # json.load converts the JSON array into a Python list of dictionaries.
    # 'with' closes the file when this indented block finishes.
    with STUDENTS_FILE.open(encoding="utf-8") as file:
        return json.load(file)


# A decorator connects an HTTP method and URL path to the function below it.
@app.get("/")
def root():
    return {"message": "Welcome to the Student API! Hello", "documentation": "/docs"}


@app.get("/app", include_in_schema=False)
def frontend():
    return FileResponse(FRONTEND_DIR / "index.html")


@app.get("/employee")
def list_employee():
    # Load on every request, so a saved edit to the JSON is visible immediately.
    return load_employee()


@app.get("/employee/{employee_id}")
def get_employee(employee_id: int):
    # FastAPI reads the URL value and validates/converts it to an integer.
    employee = load_employee()
    for employee in employee:
        # [] reads a dictionary entry; == compares two values.
        if employee ["employee_id"] == employee_id:
            return employee  # return ends the function; FastAPI sends JSON.

    # Outside the loop: report 'not found' only after checking every student.
    raise HTTPException(status_code=404, detail="Student not found")


@app.get("/request")
def list_request():
    return load_records("request.json")


# 4. Relationships: both IDs identify an request in this small model.
@app.get("/request/{requester_id}/{employee_id}")
def get_request(requester_id: int, employee_id: str):
    for request in load_records("request.json"):
        if (request["requester_id"] == requester_id
                and request["employee_id"] == employee_id):
            return request
    raise HTTPException(status_code=404, detail="request not found")

# Try /students/1002, /students/9999 and /students/abc in /docs.
# Then trace /enrolments/1001/IS101 to the two linked records.
# This first API reads data. The optional registration_demo.py writes one record.
