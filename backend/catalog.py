"""Sample menu and fictional cafe locations. All amounts are integer USD cents."""

STORES = [
    {"id": "ny-flatiron", "name": "Flatiron", "city": "New York", "address": "112 W 23rd Street", "hours": "6:30 AM – 8:00 PM", "wait_minutes": 6, "available": True},
    {"id": "ny-soho", "name": "SoHo", "city": "New York", "address": "84 Spring Street", "hours": "7:00 AM – 8:00 PM", "wait_minutes": 8, "available": True},
    {"id": "se-capitol", "name": "Capitol Hill", "city": "Seattle", "address": "420 E Pike Street", "hours": "6:00 AM – 7:00 PM", "wait_minutes": 5, "available": True},
    {"id": "se-fremont", "name": "Fremont", "city": "Seattle", "address": "3501 Fremont Avenue N", "hours": "6:30 AM – 6:00 PM", "wait_minutes": 7, "available": True},
    {"id": "au-south", "name": "South Congress", "city": "Austin", "address": "1600 S Congress Avenue", "hours": "7:00 AM – 7:00 PM", "wait_minutes": 5, "available": True},
    {"id": "au-downtown", "name": "Downtown", "city": "Austin", "address": "311 Congress Avenue", "hours": "7:00 AM – 5:00 PM", "wait_minutes": 0, "available": False},
]

MENU = [
    {"id": "iced-oat-latte", "name": "Iced Oat Latte", "category": "Iced coffee", "description": "Our signature espresso, creamy oat milk, and plenty of ice. Your everyday, a little better.", "price": 525, "calories": 150, "image": "iced-latte", "badge": "BrewGo favorite", "featured": True, "milk": True, "allergens": "Contains oats. Prepared with equipment that also handles milk, soy, wheat, eggs, and nuts."},
    {"id": "vanilla-cold-brew", "name": "Vanilla Sweet Cream Cold Brew", "category": "Iced coffee", "description": "Slow-steeped cold brew with a soft pour of house-made vanilla sweet cream.", "price": 495, "calories": 110, "image": "cold-brew", "badge": None, "featured": True, "milk": True, "allergens": "Contains milk. Prepared in a shared kitchen."},
    {"id": "caramel-latte", "name": "Caramel Iced Latte", "category": "Iced coffee", "description": "Espresso and milk over ice, finished with a smooth caramel drizzle.", "price": 545, "calories": 220, "image": "iced-latte", "badge": None, "featured": False, "milk": True, "allergens": "Contains milk. Prepared in a shared kitchen."},
    {"id": "flat-white", "name": "Flat White", "category": "Hot coffee", "description": "A double shot of espresso under velvety steamed milk. Small cup, full flavor.", "price": 445, "calories": 140, "image": "flat-white", "badge": None, "featured": True, "milk": True, "allergens": "Contains milk. Prepared in a shared kitchen."},
    {"id": "cappuccino", "name": "Classic Cappuccino", "category": "Hot coffee", "description": "Rich espresso, steamed milk, and a generous cap of airy foam.", "price": 425, "calories": 120, "image": "cappuccino", "badge": None, "featured": False, "milk": True, "allergens": "Contains milk. Prepared in a shared kitchen."},
    {"id": "americano", "name": "Caffè Americano", "category": "Hot coffee", "description": "Our full-bodied espresso with hot water. Simple and satisfying.", "price": 325, "calories": 15, "image": "americano", "badge": None, "featured": False, "milk": False, "allergens": "Prepared in a shared kitchen."},
    {"id": "iced-matcha", "name": "Iced Matcha Latte", "category": "Tea & matcha", "description": "Finely ground matcha meets milk and ice. Smooth, earthy, quietly refreshing.", "price": 545, "calories": 190, "image": "iced-matcha", "badge": "A fresh favorite", "featured": True, "milk": True, "allergens": "Contains milk. Prepared in a shared kitchen."},
    {"id": "chai-latte", "name": "Chai Tea Latte", "category": "Tea & matcha", "description": "Black tea, warming spices, and steamed milk. A little comfort in a cup.", "price": 465, "calories": 200, "image": "chai", "badge": None, "featured": False, "milk": True, "allergens": "Contains milk. Prepared in a shared kitchen."},
    {"id": "mint-tea", "name": "Peppermint Tea", "category": "Tea & matcha", "description": "A bright, naturally caffeine-free peppermint infusion, served hot.", "price": 345, "calories": 0, "image": "peppermint", "badge": None, "featured": False, "milk": False, "allergens": "Prepared in a shared kitchen."},
    {"id": "croissant", "name": "Butter Croissant", "category": "Bakery & food", "description": "Golden, flaky layers made with real butter. A coffee's best friend.", "price": 345, "calories": 280, "image": "croissant", "badge": None, "featured": True, "milk": False, "allergens": "Contains wheat, milk, and eggs. May contain nuts."},
    {"id": "breakfast-sandwich", "name": "Egg & Cheddar Croissant", "category": "Bakery & food", "description": "Fluffy egg and melted cheddar in a buttery croissant, served warm.", "price": 625, "calories": 440, "image": "croissant-sandwich", "badge": None, "featured": True, "milk": False, "allergens": "Contains wheat, milk, and eggs. May contain nuts."},
    {"id": "blueberry-muffin", "name": "Blueberry Muffin", "category": "Bakery & food", "description": "Soft and tender, bursting with blueberries and a golden crumble top.", "price": 375, "calories": 360, "image": "muffin", "badge": None, "featured": False, "milk": False, "allergens": "Contains wheat, milk, and eggs. May contain nuts."},
]

SIZES = {"Small": 0, "Medium": 60, "Large": 110}
MILKS = {"Whole milk": 0, "Oat milk": 70, "Almond milk": 70, "Soy milk": 60}
