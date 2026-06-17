from app.db.database import engine, Base
import app.models.models  # noqa: F401

print('Dropping schema...')
Base.metadata.drop_all(bind=engine)
print('Schema dropped')
