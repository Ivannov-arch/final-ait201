def get_batches():

    batches = [
        {
            "batch_id": "BATCH001",
            "food_name": "Fresh Vegetables",
            "quantity": 50.0,
            "unit": "kg",
            "status": "Available"
        },
        {
            "batch_id": "BATCH002",
            "food_name": "Fresh Fruits",
            "quantity": 35.0,
            "unit": "kg",
            "status": "Available"
        },
        {
            "batch_id": "BATCH003",
            "food_name": "Bakery Products",
            "quantity": 20.0,
            "unit": "kg",
            "status": "Pending"
        }
    ]

    return {
        "status": "success",
        "is_mock_data": True,
        "total_batches": len(batches),
        "batches": batches
    }