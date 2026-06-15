from app.db.database import engine, Base
# Import models so they are registered on Base.metadata
import app.models.models  # noqa: F401

print('Creating schema...')
Base.metadata.create_all(bind=engine)
print('Schema created')
